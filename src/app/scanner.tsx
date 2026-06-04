import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, useCameraDevice, useCameraPermission, useFrameOutput } from 'react-native-vision-camera';
import { Worklets } from 'react-native-worklets-core';
import { useSelector } from 'react-redux';
import { useResizer } from 'react-native-vision-camera-resizer';
import { T } from '../design-system/theme2';
import { appSessionService } from '../services/AppSessionService';
import { authenticationService } from '../services/AuthenticationService';
import { RootState } from '../store';
import { useAppDispatch } from '../store/hooks';
import { login, setProfile } from '../store/slices/authSlices';
import { User } from '../types/domain';

import { processAntiSpoofingOutput } from '../services/ai/AntiSpoofingService';
import { processEmbeddingOutput } from '../services/ai/EmbeddingService';
import { calculateFaceCrop } from '../services/ai/FaceAlignmentService';
import { generateAnchors, processBlazeFaceOutput } from '../services/ai/FaceDetectorService';

type LivenessStage = 'idle' | 'scanning' | 'success' | 'failed';

const blazefaceAnchors = generateAnchors(128, 128);

function ScanBrackets({ color = T.yellow }: { color?: string }) {
  const BT = 2.5, BL = 28;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ position: 'absolute', top: '25%', left: '12%', width: BL, height: BL, borderTopWidth: BT, borderLeftWidth: BT, borderColor: color, borderTopLeftRadius: 6 }} />
      <View style={{ position: 'absolute', top: '25%', right: '12%', width: BL, height: BL, borderTopWidth: BT, borderRightWidth: BT, borderColor: color, borderTopRightRadius: 6 }} />
      <View style={{ position: 'absolute', bottom: '22%', left: '12%', width: BL, height: BL, borderBottomWidth: BT, borderLeftWidth: BT, borderColor: color, borderBottomLeftRadius: 6 }} />
      <View style={{ position: 'absolute', bottom: '22%', right: '12%', width: BL, height: BL, borderBottomWidth: BT, borderRightWidth: BT, borderColor: color, borderBottomRightRadius: 6 }} />
      <View style={{ position: 'absolute', top: '22%', alignSelf: 'center', width: '54%', height: '44%', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(245,197,24,0.55)', borderStyle: 'dashed' }} />
    </View>
  );
}

function ConcentricLoading() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(anim, { toValue: 1, duration: 1400, useNativeDriver: true })).start();
  }, [anim]);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 120, height: 120 }}>
      <Animated.View style={{ position: 'absolute', width: 60, height: 60, borderRadius: 30, backgroundColor: T.yellow, opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.5] }) }] }} />
      <Animated.View style={{ position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: T.yellow, opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 3.2] }) }] }} />
      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: T.yellow, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={T.black} size="small" />
      </View>
    </View>
  );
}

export default function ScannerScreen() {
  const dispatch = useAppDispatch();
  const currentUser = useSelector((state: RootState) => state.auth.currentUser);
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');

  // Load Models
  const { resizer: blazeResizer } = useResizer({
    width: 128,
    height: 128,
    channelOrder: 'rgb',
    dataType: 'float32',
    scaleMode: 'cover',
    pixelLayout: 'interleaved'
  });
  const { resizer: faceResizer } = useResizer({
    width: 112,
    height: 112,
    channelOrder: 'rgb',
    dataType: 'float32',
    scaleMode: 'cover',
    pixelLayout: 'interleaved'
  });
  const blazeface = useTensorflowModel(require('../../assets/models/blazeface/blazeface.tflite'), []);
  const antispoofing = useTensorflowModel(require('../../assets/models/antispoofing/2.7_80x80_MiniFASNetV2.tflite'), []);
  const mobilefacenet = useTensorflowModel(require('../../assets/models/mobilefacenet/mobilefacenet.tflite'), []);

  const [resolvedUser, setResolvedUser] = useState<User | null>(currentUser);
  const [enrollChecked, setEnrollChecked] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setResolvedUser(currentUser);
      setEnrollChecked(true);
      return;
    }
    appSessionService.resolveLaunchState().then(state => {
      if (state.user) {
        setResolvedUser(state.user as User);
        dispatch(setProfile(state.user as User));
      } else {
        setResolvedUser(null);
      }
      setEnrollChecked(true);
    });
  }, [currentUser]);

  const [stage, setStage] = useState<LivenessStage>('idle');
  const [message, setMessage] = useState<string | null>(null);

  // Shared worklet value to prevent concurrent frames
  const isProcessing = Worklets.createSharedValue(false);

  const startFlow = useCallback(() => {
    if (stage !== 'idle') return;
    setStage('scanning');
    setMessage(null);
  }, [stage]);

  const onAuthenticationComplete = useCallback((success: boolean, resultData: any) => {
    if (success && resultData.sessionId) {
      dispatch(login({ user: currentUser!, sessionId: resultData.sessionId, source: 'offline' }));
      setStage('success');
      setTimeout(() => router.replace({ pathname: '/home', params: { justAuthenticated: '1' } } as any), 1200);
    } else {
      const reason = resultData.failureReason ?? 'no_match';
      const msg = reason === 'locked' ? 'Too many attempts. Try again later.' : reason === 'spoofed' ? 'Spoofing detected.' : 'Authentication failed.';
      setMessage(msg);
      setStage('failed');
    }
    isProcessing.value = false;
  }, [currentUser, dispatch]);

  const authenticateInJS = useCallback(async (embedding: Float32Array, confidence: number) => {
    try {
      const result = await authenticationService.authenticate(embedding, confidence);
      onAuthenticationComplete(result.success, result);
    } catch (e) {
      onAuthenticationComplete(false, { failureReason: 'error' });
    }
  }, [onAuthenticationComplete]);

  const runJSAuth = Worklets.createRunOnJS(authenticateInJS);
  const runJSFail = Worklets.createRunOnJS((reason: string) => {
    onAuthenticationComplete(false, { failureReason: reason });
  });

  const frameOutput = useFrameOutput({
    onFrame: (frame) => {
    'worklet';
    if (stage !== 'scanning' || isProcessing.value) return;
    if (!blazeface.model || !antispoofing.model || !mobilefacenet.model) return;

    isProcessing.value = true;

    
      try {
        // 1. Resize to 128x128 for BlazeFace
        if (!blazeResizer || !faceResizer) return;
        const blazeFrame = blazeResizer.resize(frame);
        const bfArray = new Float32Array(blazeFrame.getPixelBuffer());
        blazeFrame.dispose();

        // Normalize 0-255 to -1.0 to 1.0 inline
        for (let i = 0; i < bfArray.length; i++) {
          bfArray[i] = (bfArray[i] / 127.5) - 1.0;
        }

        const bfOutput = blazeface.model!.runSync([bfArray.buffer as ArrayBuffer]);
        // TFLite returns a Record of outputs, usually just one main flat array or multiple.
        // Assuming output is a flat Float32Array in the first key
        const rawOutput = new Float32Array(bfOutput[0]);

        const detection = processBlazeFaceOutput(rawOutput, blazefaceAnchors, frame.width, frame.height);

        if (detection.faces.length === 0) {
          isProcessing.value = false;
          return;
        }

        const face = detection.faces[0];

        // 2. Crop Face for AntiSpoofing & MobileFaceNet
        // Using Option 1: Full-Frame Scaling
        const faceCropFrame = faceResizer.resize(frame);
        const fmArray = new Float32Array(faceCropFrame.getPixelBuffer());
        faceCropFrame.dispose();

        // Normalize -1.0 to 1.0
        for (let i = 0; i < fmArray.length; i++) {
          fmArray[i] = (fmArray[i] / 127.5) - 1.0;
        }

        // 3. AntiSpoofing Check
        const spoofOutput = antispoofing.model!.runSync([fmArray.buffer as ArrayBuffer]);
        const spoofResult = processAntiSpoofingOutput(new Float32Array(spoofOutput[0]));

        if (!spoofResult.isRealFace) {
          runJSFail('spoofed');
          return;
        }

        // 4. Generate Embedding
        const embedOutput = mobilefacenet.model!.runSync([fmArray.buffer as ArrayBuffer]);
        const embedding = processEmbeddingOutput(new Float32Array(embedOutput[0]));

        // 5. Authenticate via JS
        runJSAuth(embedding, spoofResult.confidence);
      } catch (e) {
        console.error('Frame Processor Error', e);
        isProcessing.value = false;
      }
  }
  });

  const reset = () => {
    setStage('idle');
    setMessage(null);
  };

  if (!hasPermission) {
    return (
      <SafeAreaView style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={T.black} />
        <View style={s.permBox}>
          <Text style={s.permTitle}>Camera needed</Text>
          <Text style={s.permSub}>The front camera is required for biometric authentication.</Text>
          <Pressable style={s.btnYellow} onPress={() => requestPermission()}>
            <Text style={s.btnText}>Allow camera</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={{ marginTop: T.sp8 }}>
            <Text style={{ color: T.muted, fontFamily: T.font, fontSize: T.fs13 }}>← Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) return <View style={s.root}><ActivityIndicator color={T.yellow} style={{ flex: 1 }} /></View>;

  if (!enrollChecked) {
    return <SafeAreaView style={s.root}><View style={s.permBox}><Text style={[s.permSub, { color: 'rgba(255,255,255,0.6)' }]}>Checking enrollment…</Text></View></SafeAreaView>;
  }

  if (!resolvedUser) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.permBox}>
          <Text style={s.permTitle}>Not enrolled</Text>
          <Text style={s.permSub}>Register your face first to use biometric sign-in.</Text>
          <Pressable style={s.btnYellow} onPress={() => router.replace('/enrollment')}>
            <Text style={s.btnText}>Go to registration</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.black} />
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={stage === 'idle' || stage === 'scanning'}
        outputs={[frameOutput]}
        
      />
      <View style={s.topOverlay} />
      <View style={s.bottomOverlay} />
      <ScanBrackets color={stage === 'success' ? T.success : stage === 'failed' ? T.error : T.yellow} />
      <SafeAreaView style={s.overlay} pointerEvents="box-none">
        <View style={s.topSection}>
          <View style={s.topBar}>
            <Pressable onPress={() => router.back()} style={s.backBtn} pointerEvents="auto"><Text style={s.backArrow}>←</Text></Pressable>
            <Text style={s.topBarTitle}>Face Authentication</Text>
            <View style={{ width: 40 }} />
          </View>
          {stage === 'idle' && (
            <View style={s.hintBox}><Text style={s.hintText}>Position your face inside the frame</Text></View>
          )}
        </View>
        <View style={s.bottomBar}>
          {stage === 'success' && (<View style={[s.statusBar, { backgroundColor: T.success }]}><Text style={s.statusIcon}>✓</Text><Text style={s.statusText}>Authenticated! Redirecting…</Text></View>)}
          {stage === 'failed' && (<View style={[s.statusBar, { backgroundColor: T.error }]}><Text style={s.statusIcon}>✕</Text><Text style={s.statusText}>{message}</Text><Pressable onPress={reset} style={s.retryBtn} pointerEvents="auto"><Text style={s.retryText}>Retry</Text></Pressable></View>)}
          {stage === 'idle' && (<Pressable style={({ pressed }) => [s.startBtn, pressed && { opacity: 0.88 }]} onPress={startFlow} pointerEvents="auto"><Text style={s.startBtnText}>Start scan</Text></Pressable>)}
          {stage !== 'success' && stage !== 'failed' && (<Text style={s.nameTag}>{resolvedUser?.full_name}</Text>)}
        </View>
      </SafeAreaView>
      {stage === 'scanning' && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: T.white, zIndex: 999, justifyContent: 'space-between', alignItems: 'center', opacity: 0.85 }]} pointerEvents="none">
          <View style={{ flex: 1 }} />
          <View style={{ flex: 2, justifyContent: 'center', alignItems: 'center' }}>
            <ConcentricLoading />
            <Text style={{ marginTop: 50, fontSize: T.fs20, fontWeight: '700', color: T.black, fontFamily: T.font }}>Analyzing Face</Text>
            <Text style={{ marginTop: 8, fontSize: T.fs14, color: T.muted, fontFamily: T.font, textAlign: 'center', paddingHorizontal: 40 }}>Running active liveness and affine alignment...</Text>
          </View>
          <View style={{ paddingBottom: 50, alignItems: 'center' }}><Text style={{ fontSize: T.fs12, color: T.muted, fontFamily: T.font }}>Secure Biometric Check</Text></View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.black },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: '38%', backgroundColor: 'rgba(0,0,0,0.65)' },
  bottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '26%', backgroundColor: 'rgba(0,0,0,0.65)' },
  topSection: { backgroundColor: 'transparent' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.sp16, paddingTop: T.sp4 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: T.fs22, color: T.white },
  topBarTitle: { fontSize: T.fs15, fontWeight: '600', color: T.white, fontFamily: T.font },
  hintBox: { alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: T.sp16, paddingVertical: T.sp8, borderRadius: T.r999, marginTop: T.sp8 },
  hintText: { color: T.white, fontSize: T.fs13, fontFamily: T.font, textAlign: 'center' },
  bottomBar: { paddingHorizontal: T.sp20, paddingBottom: T.sp24, gap: T.sp12, alignItems: 'center' },
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: T.sp10, width: '100%', borderRadius: T.r12, padding: T.sp16 },
  statusIcon: { fontSize: T.fs18, fontWeight: '700', color: T.white },
  statusText: { flex: 1, fontSize: T.fs14, color: T.white, fontFamily: T.font },
  retryBtn: { paddingHorizontal: T.sp12, paddingVertical: T.sp6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: T.r6 },
  retryText: { fontSize: T.fs12, fontWeight: '600', color: T.white, fontFamily: T.font },
  startBtn: { width: '100%', height: 56, backgroundColor: T.yellow, borderRadius: T.r12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.yellowDark },
  startBtnText: { fontSize: T.fs16, fontWeight: '700', color: T.black, fontFamily: T.font },
  nameTag: { fontSize: T.fs12, color: 'rgba(255,255,255,0.55)', fontFamily: T.font },
  permBox: { flex: 1, backgroundColor: T.black, alignItems: 'center', justifyContent: 'center', padding: T.sp32, gap: T.sp16 },
  permTitle: { fontSize: T.fs24, fontWeight: '700', color: T.white, fontFamily: T.font, textAlign: 'center' },
  permSub: { fontSize: T.fs14, color: 'rgba(255,255,255,0.6)', fontFamily: T.font, textAlign: 'center', lineHeight: 22 },
  btnYellow: { width: '100%', height: 54, backgroundColor: T.yellow, borderRadius: T.r12, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: T.fs16, fontWeight: '700', color: T.black, fontFamily: T.font },
});
