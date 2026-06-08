import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { Camera, useCameraDevice, useCameraPermission, useFrameOutput } from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import { createSynchronizable, runOnJS } from 'react-native-worklets';
// removed reanimated import
import { Face, useFaceDetector } from 'react-native-vision-camera-face-detector';
import { Asset } from 'expo-asset';

import { T } from '../design-system/theme2';
import { processAntiSpoofingOutput } from '../services/ai/AntiSpoofingService';
import { processEmbeddingOutput } from '../services/ai/EmbeddingService';
import { livenessService, extractLivenessMetrics } from '../services/ai/LivenessService';
import { LivenessMetrics } from '../types/liveness';
import { cropAndScaleTensor } from '../utils/mathUtils';

// ── Shared Face Overlay ──────────────────────────────────────────────────
function FaceOverlay({ captured, required, hideProgress = false }: { captured: number; required: number; hideProgress?: boolean }) {
  const pct = required > 0 ? (captured / required) * 100 : 0;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* corner brackets */}
      {(['TL', 'TR', 'BL', 'BR'] as const).map(pos => (
        <View key={pos} style={[s.bracket, s[`bracket${pos}` as keyof typeof s] as any]} />
      ))}
      {/* Progress arc indicator at top */}
      {!hideProgress && (
        <View style={s.progressPill}>
          <View style={[s.progressFill, { width: `${pct}%` as any }]} />
          <Text style={s.progressText}>{captured}/{required}</Text>
        </View>
      )}
      {/* Center circle guide */}
      <View style={s.centerCircle} />
    </View>
  );
}

// ── Props ────────────────────────────────────────────────────────────────
export interface BiometricScannerProps {
  /** Mode affects internal hints, but logic is driven by requiredCaptures */
  mode: 'enrollment' | 'authentication';
  /** The parent's state of how many frames have been captured */
  captured: number;
  /** How many frames are required before onComplete is called */
  requiredCaptures: number;
  /** The current stage controlled by the parent */
  stage: 'liveness' | 'capture';
  /** External error string to display */
  error?: string | null;
  /** Triggered when liveness challenges are successfully completed */
  onLivenessPassed: () => void;
  /** Triggered when a liveness challenge fails */
  onLivenessFailed?: (reason: string) => void;
  /** Triggered each time a valid face frame is processed */
  onCapture: (embedding: Float32Array, confidence: number) => Promise<void>;
}

// ── BiometricScanner ─────────────────────────────────────────────────────
export function BiometricScannerCore({
  mode,
  captured,
  requiredCaptures,
  stage,
  error,
  onLivenessPassed,
  onLivenessFailed,
  onCapture,
  antiUri,
  faceNetUri,
}: BiometricScannerProps & { antiUri: string, faceNetUri: string }) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  // Liveness local state
  const [livenessInstruction, setLivenessInstruction] = useState('Please look at the camera');
  const [localError, setLocalError] = useState<string | null>(null);

  // Machine Learning Models
  const faceDetector = useFaceDetector({
    performanceMode: 'fast',
    runLandmarks: true,
    runClassifications: true,
  });

  const { resizer: baseResizer } = useResizer({
    width: 512,
    height: 512,
    channelOrder: 'bgr',
    dataType: 'float32',
    scaleMode: 'contain',
    pixelLayout: 'interleaved'
  });

  // Load TensorFlow models via file:// URI (resolved by parent)
  const antiSource = useMemo(() => ({ url: antiUri }), [antiUri]);
  const faceNetSource = useMemo(() => ({ url: faceNetUri }), [faceNetUri]);
  
  const antispoofing = useTensorflowModel(antiSource, []);
  const mobilefacenet = useTensorflowModel(faceNetSource, []);
  const isModelsReady = useMemo(() => !!antispoofing.model && !!mobilefacenet.model, [antispoofing.model, mobilefacenet.model]);

  // Processing state
  const isCapturing = useRef(createSynchronizable(false)).current;
  const isProcessing = useRef(createSynchronizable(false)).current;
  const lastCaptureTime = useRef(createSynchronizable(0)).current;

  // Ensure liveness starts when stage changes to liveness
  useEffect(() => {
    if (stage === 'liveness') {
      livenessService.startSession();
      // Delay initial capture to avoid instant captures
      lastCaptureTime.setBlocking(Date.now() + 2000);
    } else if (stage === 'capture') {
      lastCaptureTime.setBlocking(Date.now());
    }
  }, [stage]);

  // ── Callbacks mapped to JS thread ────────────────────────────────────────
  const dispatchToJS = useCallback((embeddingArray: number[], confidence: number) => {
    // Avoid double captures if already met requirements
    if (captured >= requiredCaptures) return;

    const embedding = new Float32Array(embeddingArray);
    onCapture(embedding, confidence).catch(err => {
      setLocalError(err instanceof Error ? err.message : 'Capture failed');
    });
  }, [onCapture, captured, requiredCaptures]);

  const handleLivenessMetrics = useCallback((metrics: LivenessMetrics) => {
    if (stage !== 'liveness') return;

    const result = livenessService.processMeasurements(metrics);
    
    if (result.passed) {
      onLivenessPassed();
    } else {
      const active = livenessService.getActiveChallenge();
      if (active) {
        const instr = livenessService.getInstructionForChallenge(active);
        setLivenessInstruction(prev => prev !== instr ? instr : prev);
      } else if (result.failureReason) {
        if (mode !== 'enrollment' && onLivenessFailed) {
          onLivenessFailed(result.failureReason);
        } else {
          setLocalError('Liveness check failed. Retrying...');
          livenessService.startSession();
        }
      }
    }
  }, [stage, mode, onLivenessPassed, onLivenessFailed]);

  const safeLog = useCallback((msg: string) => { console.log(msg); }, []);

  // ── Frame Processor ──────────────────────────────────────────────────────
  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    enablePhysicalBufferRotation: true,
    onFrame: (frame) => {
      'worklet';
      if (isProcessing.getBlocking() || !isCapturing.getBlocking() || !isModelsReady || captured >= requiredCaptures) {
        frame.dispose();
        return;
      }
      if (!faceDetector || !antispoofing || !mobilefacenet || !baseResizer) {
        frame.dispose();
        return;
      }

      const now = Date.now();
      
      // Global frame throttling (~15 FPS) to prevent thermal overload and battery drain
      if (stage === 'liveness' && now - lastCaptureTime.getBlocking() < 66) {
        frame.dispose();
        return;
      }

      // Throttle captures to 800ms
      if (stage === 'capture') {
        if (now - lastCaptureTime.getBlocking() < 800) {
          frame.dispose();
          return;
        }
      }

      try {
        isProcessing.setBlocking(true);

        let faces: Face[] = [];
        try {
          faces = faceDetector.detectFaces(frame);
        } catch (e) {
          runOnJS(safeLog)(`Face detection failed: ${String(e)}`);
        }

        if (faces.length === 0) {
          isProcessing.setBlocking(false);
          return;
        }

        // Sort faces by largest area to prevent jitter when multiple people are in frame
        faces.sort((a, b) => {
          const areaA = a.bounds.width * a.bounds.height;
          const areaB = b.bounds.width * b.bounds.height;
          return areaB - areaA;
        });

        const face = faces[0];
        const bounds = face.bounds;

        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        const faceSize = Math.max(bounds.width, bounds.height);
        const expandedSize = faceSize * 1.2;
        
        const squareX = centerX - expandedSize / 2;
        const squareY = centerY - expandedSize / 2;

        const maxDim = Math.max(frame.width, frame.height);
        const scale = 512 / maxDim;
        const offsetX = (512 - (frame.width * scale)) / 2;
        const offsetY = (512 - (frame.height * scale)) / 2;

        const mappedX = (squareX * scale) + offsetX;
        const mappedY = (squareY * scale) + offsetY;
        const mappedW = expandedSize * scale;
        const mappedH = expandedSize * scale;

        if (stage === 'liveness') {
          // Update capture timestamp for FPS throttling
          lastCaptureTime.setBlocking(Date.now());
          const metrics = extractLivenessMetrics(face, frame.width, frame.height);
          runOnJS(handleLivenessMetrics)(metrics);
        } else if (stage === 'capture') {
          // Update capture timestamp immediately
          lastCaptureTime.setBlocking(Date.now());

          const baseFrame = baseResizer.resize(frame);
          const baseRaw = new Float32Array(baseFrame.getPixelBuffer());
          baseFrame.dispose();

          // AntiSpoofing
          const smArray = cropAndScaleTensor(baseRaw, 512, 512, mappedX, mappedY, mappedW, mappedH, 80, 80, '[0, 255]');
          const spoofOutput = antispoofing.model!.runSync([smArray.buffer as ArrayBuffer]);
          const rawSpoof = new Float32Array(spoofOutput[0]);
          const spoofResult = processAntiSpoofingOutput(rawSpoof);

          if (spoofResult.isRealFace) {
            // MobileFaceNet
            const fmArray = cropAndScaleTensor(baseRaw, 512, 512, mappedX, mappedY, mappedW, mappedH, 112, 112, '[-1, 1]');
            const embedOutput = mobilefacenet.model!.runSync([fmArray.buffer as ArrayBuffer]);
            const embedding = processEmbeddingOutput(new Float32Array(embedOutput[0]));

            const embeddingArray = Array.from(embedding);
            runOnJS(dispatchToJS)(embeddingArray, spoofResult.confidence);
          }
        }
      } catch (e) {
        runOnJS(safeLog)(`Frame Processor Error: ${String(e)}`);
      } finally {
        isProcessing.setBlocking(false);
        frame.dispose();
      }
    }
  });

  const displayError = error || localError;

  return (
    <View style={{ flex: 1 }}>
      {!hasPermission ? (
        <View style={s.permBox}>
          <Text style={s.permTitle}>Camera access needed</Text>
          <Text style={s.permSub}>We use the front camera only for face scanning.</Text>
          <Pressable style={s.btnPrimary} onPress={() => requestPermission()}>
            <Text style={s.btnPrimaryText}>Allow camera</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={s.cameraWrap}>
            {device && (
              <Camera
                style={StyleSheet.absoluteFill}
                device={device}
                isActive={true}
                resizeMode="cover"
                outputs={[frameOutput]}
              />
            )}
            <FaceOverlay captured={captured} required={requiredCaptures} hideProgress={stage === 'liveness'} />
          </View>

          <View style={s.captureBar}>
            <View>
              {stage === 'liveness' ? (
                <>
                  <Text style={s.captureSub}>Prove you are real</Text>
                  <Text style={s.captureTitle}>{livenessInstruction}</Text>
                </>
              ) : (
                <>
                  <Text style={s.captureTitle}>
                    {mode === 'enrollment' ? `Capture ${captured} of ${requiredCaptures}` : 'Verifying Identity'}
                  </Text>
                  <Text style={s.captureSub}>
                    {mode === 'enrollment' 
                      ? (captured === 0 ? 'Face the camera straight on.' : captured < 3 ? 'Slowly turn your head left or right.' : 'Almost done — slightly tilt your head.')
                      : 'Please hold still while we scan your face.'}
                  </Text>
                </>
              )}
            </View>
            {displayError ? <Text style={s.errorText}>{displayError}</Text> : null}

            {/* Auto Capture Indicator or Start Button */}
            {!isCapturing.getBlocking() ? (
              <Pressable
                style={({ pressed }) => [s.btnPrimary, pressed && s.btnPressed, { marginTop: 12 }]}
                onPress={() => {
                  setLocalError(null);
                  isCapturing.setBlocking(true);
                }}
              >
                <Text style={s.btnPrimaryText}>Start Scan</Text>
              </Pressable>
            ) : (
              <View style={s.autoCaptureIndicator}>
                <ActivityIndicator color={T.yellow} size="small" />
                <Text style={s.autoCaptureText}>
                  {stage === 'liveness' ? 'Analyzing liveness...' : 'Auto-capturing frames...'}
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

export default function BiometricScanner(props: BiometricScannerProps) {
  const [antiUri, setAntiUri] = useState<string | null>(null);
  const [faceNetUri, setFaceNetUri] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [antiAsset] = await Asset.loadAsync(require('../../assets/models/antispoofing/2.7_80x80_MiniFASNetV2.tflite'));
        const [faceAsset] = await Asset.loadAsync(require('../../assets/models/mobilefacenet/mobilefacenet.tflite'));
        // localUri gives us a file:// path that java.net.URL can actually read
        setAntiUri(antiAsset.localUri || antiAsset.uri);
        setFaceNetUri(faceAsset.localUri || faceAsset.uri);
      } catch (e) {
        console.error("Failed to load local asset URIs", e);
      }
    })();
  }, []);

  if (!antiUri || !faceNetUri) {
    return (
      <View style={{ flex: 1, backgroundColor: T.black, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={T.yellow} size="large" />
        <Text style={{ color: T.white, marginTop: T.sp16, fontFamily: T.font, fontSize: T.fs16 }}>Loading AI Models...</Text>
      </View>
    );
  }

  return <BiometricScannerCore {...props} antiUri={antiUri} faceNetUri={faceNetUri} />;
}

const s = StyleSheet.create({
  permBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: T.sp32, gap: T.sp16 },
  permTitle: { fontSize: T.fs20, fontWeight: '700', color: T.black, fontFamily: T.font, textAlign: 'center' },
  permSub: { fontSize: T.fs14, color: T.muted, fontFamily: T.font, textAlign: 'center', lineHeight: 22 },

  btnPrimary: { backgroundColor: T.yellow, paddingVertical: T.sp16, borderRadius: T.r8, alignItems: 'center', justifyContent: 'center', marginTop: T.sp8, borderWidth: 1.5, borderColor: T.yellowDark },
  btnPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  btnPrimaryText: { fontSize: T.fs16, fontWeight: '700', color: T.black, fontFamily: T.font },

  cameraWrap: { flex: 1, backgroundColor: T.black, position: 'relative', overflow: 'hidden' },
  progressPill: { position: 'absolute', top: 16, alignSelf: 'center', width: 120, height: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  progressFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: T.yellow, borderRadius: 10 },
  progressText: { fontSize: T.fs11, color: T.white, fontWeight: '700', fontFamily: T.font, zIndex: 3 },
  bracket: { position: 'absolute', width: 40, height: 40, borderColor: '#00FF00', borderWidth: 4, zIndex: 2 },
  bracketTL: { top: 40, left: 40, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 16 },
  bracketTR: { top: 40, right: 40, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 16 },
  bracketBL: { bottom: 40, left: 40, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 16 },
  bracketBR: { bottom: 40, right: 40, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 16 },
  centerCircle: { position: 'absolute', top: '25%', left: '15%', right: '15%', bottom: '25%', borderRadius: 1000, borderWidth: 1.5, borderColor: 'rgba(245,197,24,0.4)', borderStyle: 'dashed', zIndex: 2 },

  captureBar: { backgroundColor: T.white, padding: T.sp24, paddingBottom: T.sp32, gap: T.sp16 },
  captureTitle: { fontSize: T.fs20, fontWeight: '700', color: T.black, fontFamily: T.font },
  captureSub: { fontSize: T.fs13, color: T.muted, fontFamily: T.font },

  autoCaptureIndicator: { flexDirection: 'row', alignItems: 'center', gap: T.sp8, backgroundColor: T.offWhite, padding: T.sp12, borderRadius: T.r8, alignSelf: 'flex-start' },
  autoCaptureText: { fontSize: T.fs12, color: T.muted, fontFamily: T.font, fontWeight: '600' },

  errorText: { fontSize: T.fs13, color: T.error, fontFamily: T.font },
});
