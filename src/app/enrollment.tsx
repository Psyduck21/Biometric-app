import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraPermission, useCameraDevice, useFrameOutput } from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { Worklets } from 'react-native-worklets-core';
import { router } from 'expo-router';
import { useAppDispatch } from '../store/hooks';
import { setProfile } from '../store/slices/authSlices';
import { appSessionService } from '../services/AppSessionService';
import { enrollmentService } from '../services/EnrollmentService';
import { T } from '../design-system/theme2';

import { processBlazeFaceOutput, generateAnchors } from '../services/ai/FaceDetectorService';
import { calculateFaceCrop } from '../services/ai/FaceAlignmentService';
import { processAntiSpoofingOutput } from '../services/ai/AntiSpoofingService';
import { processEmbeddingOutput } from '../services/ai/EmbeddingService';

type Stage = 'info' | 'capture' | 'success';

const blazefaceAnchors = generateAnchors(128, 128);

// ── Step indicator ─────────────────────────────────────────────────────────
function StepRow({ current }: { current: number }) {
  const labels = ['Profile', 'Face scan', 'Done'];
  return (
    <View style={s.stepRow}>
      {labels.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <View style={s.stepItem}>
              <View style={[
                s.stepDot,
                done   && s.stepDotDone,
                active && s.stepDotActive,
              ]}>
                {done ? (
                  <Text style={s.stepCheck}>✓</Text>
                ) : (
                  <Text style={[s.stepNum, active && s.stepNumActive]}>{i + 1}</Text>
                )}
              </View>
              <Text style={[s.stepLabel, active && s.stepLabelActive]}>{label}</Text>
            </View>
            {i < labels.length - 1 && (
              <View style={[s.stepLine, done && s.stepLineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Face scan overlay ──────────────────────────────────────────────────────
function FaceOverlay({ captured, required }: { captured: number; required: number }) {
  const pct = (captured / required) * 100;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* corner brackets */}
      {(['TL','TR','BL','BR'] as const).map(pos => (
        <View key={pos} style={[s.bracket, s[`bracket${pos}` as keyof typeof s] as any]} />
      ))}
      {/* Progress arc indicator at top */}
      <View style={s.progressPill}>
        <View style={[s.progressFill, { width: `${pct}%` as any }]} />
        <Text style={s.progressText}>{captured}/{required}</Text>
      </View>
      {/* Center circle guide */}
      <View style={s.centerCircle} />
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function EnrollmentScreen() {
  const dispatch   = useAppDispatch();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  // Load Models
  const resizePlugin = useResizePlugin();
  const blazeface = useTensorflowModel(require('../../assets/models/blazeface/blazeface.tflite'), []);
  const antispoofing = useTensorflowModel(require('../../assets/models/antispoofing/2.7_80x80_MiniFASNetV2.tflite'), []);
  const mobilefacenet = useTensorflowModel(require('../../assets/models/mobilefacenet/mobilefacenet.tflite'), []);

  const [stage, setStage]         = useState<Stage>('info');
  const [fullName, setFullName]   = useState('');
  const [employeeId, setEmpId]    = useState('');
  const [email, setEmail]         = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [captured, setCaptured]   = useState(0);
  const [required, setRequired]   = useState(5);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // Throttling state for JS
  const lastCaptureTime = useRef<number>(0);

  // ── Step 1 submit ──────────────────────────────────────────────────────
  const handleContinue = async () => {
    if (!fullName.trim() || !employeeId.trim() || !email.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const user = await appSessionService.registerUser({ fullName, employeeId, email });
      dispatch(setProfile(user));
      const session = await enrollmentService.startEnrollment(user.id);
      setSessionId(session.sessionId);
      setRequired(session.requiredSamples);
      setCaptured(session.capturedSamples);
      setStage('capture');
      lastCaptureTime.current = Date.now();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create profile.');
    } finally {
      setBusy(false);
    }
  };

  // ── Step 2 Automatic Capture ───────────────────────────────────────────
  const onValidFrame = useCallback(async (embedding: Float32Array, confidence: number) => {
    if (stage !== 'capture' || !sessionId) return;

    const now = Date.now();
    if (now - lastCaptureTime.current < 800) { // Wait 800ms between captures to allow slight head movement
      return;
    }

    if (captured >= required) return;

    lastCaptureTime.current = now;
    
    try {
      // Pass empty string for alignedFrame as it's not saved to disk
      const updated = await enrollmentService.addSample(sessionId, "" as any, embedding, confidence);
      setCaptured(updated.capturedSamples);

      if (updated.capturedSamples >= updated.requiredSamples) {
        const result = await enrollmentService.finalizeEnrollment(sessionId);
        if (!result.success) throw new Error(result.failureReason ?? 'Enrollment failed.');
        setStage('success');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Capture failed.');
    }
  }, [stage, sessionId, captured, required]);

  const runJSOnFrame = Worklets.createRunOnJS(onValidFrame);
  const isProcessing = Worklets.createSharedValue(false);

  const frameOutput = useFrameOutput({
  onFrame: (frame) => {
    'worklet';
    if (stage !== 'capture' || isProcessing.value) return;
    if (!blazeface.model || !antispoofing.model || !mobilefacenet.model) return;

    isProcessing.value = true;

    
      try {
        const blazefaceInput = resizePlugin.resize(frame, {
          scale: { width: 128, height: 128 },
          pixelFormat: 'rgb',
          dataType: 'float32',
        });
        
        const bfArray = new Float32Array(blazefaceInput.buffer);
        for (let i = 0; i < bfArray.length; i++) {
          bfArray[i] = (bfArray[i] / 127.5) - 1.0;
        }

        const bfOutput = blazeface.model!.runSync([bfArray.buffer as ArrayBuffer]);
        const rawOutput = new Float32Array(bfOutput[0]);
        const detection = processBlazeFaceOutput(rawOutput, blazefaceAnchors, frame.width, frame.height);
        
        if (detection.faces.length > 0) {
          const face = detection.faces[0];
          const cropBounds = calculateFaceCrop(frame.width, frame.height, face);
          
          const faceCrop = resizePlugin.resize(frame, {
            crop: cropBounds,
            scale: { width: 112, height: 112 },
            pixelFormat: 'rgb',
            dataType: 'float32',
          });

          const fmArray = new Float32Array(faceCrop.buffer);
          for (let i = 0; i < fmArray.length; i++) {
            fmArray[i] = (fmArray[i] / 127.5) - 1.0;
          }

          const spoofOutput = antispoofing.model!.runSync([fmArray.buffer as ArrayBuffer]);
          const spoofResult = processAntiSpoofingOutput(new Float32Array(spoofOutput[0]));
          
          if (spoofResult.isRealFace) {
            const embedOutput = mobilefacenet.model!.runSync([fmArray.buffer as ArrayBuffer]);
            const embedding = processEmbeddingOutput(new Float32Array(embedOutput[0]));
            runJSOnFrame(embedding, spoofResult.confidence);
          }
        }
      } catch (e) {
        console.error('Frame Processor Error', e);
      } finally {
        isProcessing.value = false;
      }
  }
  });

  const stageIndex = stage === 'info' ? 0 : stage === 'capture' ? 1 : 2;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={T.white} />
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </Pressable>
        <Text style={s.screenTitle}>Registration</Text>
        <View style={{ width: 40 }} />
      </View>

      <StepRow current={stageIndex} />
      <View style={s.divider} />

      {/* ── Stage: Info ─────────────────────────────────────────────── */}
      {stage === 'info' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={s.infoScroll} keyboardShouldPersistTaps="handled">
            <Text style={s.stageHeading}>Tell us about yourself</Text>
            <Text style={s.stageSub}>Your details are stored securely on this device only.</Text>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Full name</Text>
              <TextInput
                style={s.fieldInput}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Ava Johnson"
                placeholderTextColor={T.muted}
                autoCapitalize="words"
              />
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Employee ID</Text>
              <TextInput
                style={s.fieldInput}
                value={employeeId}
                onChangeText={setEmpId}
                placeholder="EMP-1024"
                placeholderTextColor={T.muted}
                autoCapitalize="characters"
              />
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Work email</Text>
              <TextInput
                style={s.fieldInput}
                value={email}
                onChangeText={setEmail}
                placeholder="ava@company.com"
                placeholderTextColor={T.muted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [s.btnPrimary, pressed && s.btnPressed, busy && s.btnDisabled]}
              onPress={handleContinue}
              disabled={busy}
            >
              <Text style={s.btnPrimaryText}>{busy ? 'Creating profile…' : 'Continue →'}</Text>
            </Pressable>

            <Pressable onPress={() => router.push('/scanner')} style={s.linkBtn}>
              <Text style={s.linkText}>Already enrolled? Sign in instead</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── Stage: Capture ──────────────────────────────────────────── */}
      {stage === 'capture' && (
        <View style={{ flex: 1 }}>
          {!hasPermission ? (
            <View style={s.permBox}>
              <Text style={s.permTitle}>Camera access needed</Text>
              <Text style={s.permSub}>We use the front camera only for face enrollment.</Text>
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
                    outputs={[frameOutput]}
                    
                  />
                )}
                <FaceOverlay captured={captured} required={required} />
              </View>

              <View style={s.captureBar}>
                <View>
                  <Text style={s.captureTitle}>
                    Capture {captured} of {required}
                  </Text>
                  <Text style={s.captureSub}>
                    {captured === 0
                      ? 'Face the camera straight on.'
                      : captured < 3
                      ? 'Slowly turn your head left or right.'
                      : 'Almost done — slightly tilt your head.'}
                  </Text>
                </View>
                {error ? <Text style={s.errorText}>{error}</Text> : null}
                
                {/* Auto Capture Indicator */}
                <View style={s.autoCaptureIndicator}>
                  <ActivityIndicator color={T.yellow} size="small" />
                  <Text style={s.autoCaptureText}>Auto-capturing frames...</Text>
                </View>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ── Stage: Success ──────────────────────────────────────────── */}
      {stage === 'success' && (
        <View style={s.successBox}>
          <View style={s.successIcon}>
            <Text style={s.successCheck}>✓</Text>
          </View>
          <Text style={s.successHeading}>You're enrolled!</Text>
          <Text style={s.successSub}>
            Your face templates are encrypted and saved securely on this device.
          </Text>
          <Pressable
            style={({ pressed }) => [s.btnPrimary, pressed && s.btnPressed]}
            onPress={() => router.replace('/scanner')}
          >
            <Text style={s.btnPrimaryText}>Continue to sign in →</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const BRACKET_T = 3;
const BRACKET_L = 22;

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: T.white },
  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.sp16, paddingTop: T.sp8, paddingBottom: T.sp4 },
  backBtn:       { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backArrow:     { fontSize: T.fs20, color: T.black },
  screenTitle:   { fontSize: T.fs16, fontWeight: '700', color: T.black, fontFamily: T.font, letterSpacing: 0.3 },

  // Step row
  stepRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: T.sp24, paddingVertical: T.sp16 },
  stepItem:      { alignItems: 'center', gap: T.sp6 },
  stepLine:      { flex: 1, height: 1, backgroundColor: T.hairline, marginBottom: T.sp20 },
  stepLineDone:  { backgroundColor: T.yellow },
  stepDot:       { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: T.hairline, alignItems: 'center', justifyContent: 'center', backgroundColor: T.white },
  stepDotDone:   { backgroundColor: T.yellow, borderColor: T.yellow },
  stepDotActive: { borderColor: T.black, borderWidth: 2 },
  stepNum:       { fontSize: T.fs12, color: T.muted, fontFamily: T.font },
  stepNumActive: { color: T.black, fontWeight: '700' },
  stepCheck:     { fontSize: T.fs12, fontWeight: '700', color: T.black },
  stepLabel:     { fontSize: T.fs10, color: T.muted, fontFamily: T.font, letterSpacing: 0.3 },
  stepLabelActive: { color: T.black, fontWeight: '600' },

  divider:       { height: 1, backgroundColor: T.hairline },

  // Info stage
  infoScroll:    { padding: T.sp24, gap: T.sp20 },
  stageHeading:  { fontSize: T.fs28, fontWeight: '700', color: T.black, fontFamily: T.font, lineHeight: 34 },
  stageSub:      { fontSize: T.fs14, color: T.muted, fontFamily: T.font, lineHeight: 22, marginTop: -T.sp8 },
  fieldGroup:    { gap: T.sp6 },
  fieldLabel:    { fontSize: T.fs12, fontWeight: '600', color: T.charcoal, fontFamily: T.font, letterSpacing: 0.3, textTransform: 'uppercase' },
  fieldInput:    {
    height: 52, borderWidth: 1.5, borderColor: T.hairline, borderRadius: T.r8,
    paddingHorizontal: T.sp16, fontSize: T.fs16, color: T.black, fontFamily: T.font,
    backgroundColor: T.offWhite,
  },

  // Buttons
  btnPrimary:    { height: 56, backgroundColor: T.yellow, borderRadius: T.r12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.yellowDark },
  btnPressed:    { opacity: 0.88 },
  btnDisabled:   { opacity: 0.5 },
  btnPrimaryText:{ fontSize: T.fs16, fontWeight: '700', color: T.black, fontFamily: T.font },
  linkBtn:       { alignItems: 'center', paddingVertical: T.sp8 },
  linkText:      { fontSize: T.fs13, color: T.muted, fontFamily: T.font, textDecorationLine: 'underline' },

  errorText:     { fontSize: T.fs13, color: T.error, fontFamily: T.font },

  // Permission
  permBox:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: T.sp32, gap: T.sp16 },
  permTitle:     { fontSize: T.fs20, fontWeight: '700', color: T.black, fontFamily: T.font, textAlign: 'center' },
  permSub:       { fontSize: T.fs14, color: T.muted, fontFamily: T.font, textAlign: 'center', lineHeight: 22 },

  // Camera
  cameraWrap:    { flex: 1, backgroundColor: T.black, position: 'relative' },
  bracket:       { position: 'absolute', width: BRACKET_L, height: BRACKET_L },
  bracketTL:     { top: 40, left: '50%', marginLeft: -90, borderTopWidth: BRACKET_T, borderLeftWidth: BRACKET_T, borderColor: T.yellow, borderTopLeftRadius: T.r6 },
  bracketTR:     { top: 40, right: '50%', marginRight: -90, borderTopWidth: BRACKET_T, borderRightWidth: BRACKET_T, borderColor: T.yellow, borderTopRightRadius: T.r6 },
  bracketBL:     { bottom: 0, left: '50%', marginLeft: -90, borderBottomWidth: BRACKET_T, borderLeftWidth: BRACKET_T, borderColor: T.yellow, borderBottomLeftRadius: T.r6 },
  bracketBR:     { bottom: 0, right: '50%', marginRight: -90, borderBottomWidth: BRACKET_T, borderRightWidth: BRACKET_T, borderColor: T.yellow, borderBottomRightRadius: T.r6 },
  progressPill:  { position: 'absolute', top: 16, alignSelf: 'center', width: 120, height: 20, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' },
  progressFill:  { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: T.yellow, borderRadius: 10 },
  progressText:  { fontSize: T.fs11, color: T.white, fontWeight: '700', fontFamily: T.font, zIndex: 1 },
  centerCircle:  { position: 'absolute', top: '50%', alignSelf: 'center', marginTop: -80, width: 180, height: 210, borderRadius: 90, borderWidth: 1.5, borderColor: 'rgba(245,197,24,0.6)', borderStyle: 'dashed' },

  captureBar:    { backgroundColor: T.white, padding: T.sp24, paddingBottom: T.sp32, gap: T.sp16 },
  captureTitle:  { fontSize: T.fs20, fontWeight: '700', color: T.black, fontFamily: T.font },
  captureSub:    { fontSize: T.fs13, color: T.muted, fontFamily: T.font },
  
  autoCaptureIndicator: { flexDirection: 'row', alignItems: 'center', gap: T.sp8, backgroundColor: T.offWhite, padding: T.sp12, borderRadius: T.r8, alignSelf: 'flex-start' },
  autoCaptureText: { fontSize: T.fs12, color: T.muted, fontFamily: T.font, fontWeight: '600' },

  // Success
  successBox:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: T.sp32, gap: T.sp20 },
  successIcon:   { width: 80, height: 80, borderRadius: 40, backgroundColor: T.yellow, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.yellowDark },
  successCheck:  { fontSize: T.fs32, fontWeight: '700', color: T.black },
  successHeading:{ fontSize: T.fs32, fontWeight: '700', color: T.black, fontFamily: T.font },
  successSub:    { fontSize: T.fs14, color: T.muted, fontFamily: T.font, textAlign: 'center', lineHeight: 22 },
});
