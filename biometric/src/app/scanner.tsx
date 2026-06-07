import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { T } from '../design-system/theme2';
import { appSessionService } from '../services/AppSessionService';
import { authenticationService } from '../services/AuthenticationService';
import { RootState } from '../store';
import { useAppDispatch } from '../store/hooks';
import { login, setProfile } from '../store/slices/authSlices';
import { User } from '../types/domain';

import BiometricScanner from '../components/BiometricScanner';

type LivenessStage = 'info' | 'liveness' | 'capture' | 'success' | 'failed';

export default function ScannerScreen() {
  const dispatch = useAppDispatch();
  const currentUser = useSelector((state: RootState) => state.auth.currentUser);

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

  const [stage, setStage] = useState<LivenessStage>('info');
  const [message, setMessage] = useState<string | null>(null);

  const onAuthenticationComplete = useCallback((success: boolean, resultData: any) => {
    if (success && resultData.sessionId) {
      dispatch(login({ user: currentUser!, sessionId: resultData.sessionId, source: 'offline' }));
      setStage('success');
      setTimeout(() => router.replace({ pathname: '/home', params: { justAuthenticated: '1' } } as any), 1200);
    } else {
      const reason = resultData.failureReason ?? 'no_match';
      let msg = 'Authentication failed.';
      if (reason === 'locked') msg = 'Too many attempts. Try again later.';
      else if (reason === 'spoofed') msg = 'Spoofing detected.';
      else if (reason === 'offline_locked') msg = 'Offline window exceeded or time tampered. Please reconnect to internet.';
      else if (reason === 'security_violation') msg = 'Security check failed. Device may be rooted or emulator.';
      else if (reason === 'device_mismatch') msg = 'This device is no longer bound to your account.';
      
      setMessage(msg);
      setStage('failed');
    }
  }, [currentUser, dispatch]);

  const authenticateFace = useCallback(async (embedding: Float32Array, confidence: number) => {
    try {
      const result = await authenticationService.authenticate(embedding, confidence);
      onAuthenticationComplete(result.success, result);
    } catch (e) {
      onAuthenticationComplete(false, { failureReason: 'error' });
    }
  }, [onAuthenticationComplete]);

  const startFlow = () => {
    setStage('liveness');
    setMessage(null);
  };

  const reset = () => {
    setStage('info');
    setMessage(null);
  };



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
      <StatusBar barStyle="dark-content" backgroundColor={T.white} />
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </Pressable>
        <Text style={s.topBarTitle}>Authentication</Text>
        <View style={{ width: 40 }} />
      </View>

      {(stage === 'liveness' || stage === 'capture') && (
        <BiometricScanner
          mode="authentication"
          stage={stage}
          captured={0}
          requiredCaptures={1}
          error={message}
          onLivenessPassed={() => setStage('capture')}
          onCapture={authenticateFace}
        />
      )}

      {stage === 'info' && (
        <View style={s.infoBox}>
          <Text style={s.nameTag}>{resolvedUser.full_name}</Text>
          <Text style={s.permSub}>Tap Start Scan to verify your identity.</Text>
          <Pressable style={s.btnYellow} onPress={startFlow}>
            <Text style={s.btnText}>Start Scan</Text>
          </Pressable>
        </View>
      )}

      {stage === 'success' && (
        <View style={s.successBox}>
          <View style={s.successIcon}><Text style={s.successCheck}>✓</Text></View>
          <Text style={s.successHeading}>Authenticated!</Text>
          <Text style={s.permSub}>Marking attendance and redirecting...</Text>
        </View>
      )}

      {stage === 'failed' && (
        <View style={s.successBox}>
          <View style={[s.successIcon, { backgroundColor: T.error }]}><Text style={s.successCheck}>✕</Text></View>
          <Text style={s.successHeading}>Verification Failed</Text>
          <Text style={s.permSub}>{message}</Text>
          <Pressable style={[s.btnYellow, { marginTop: 20 }]} onPress={reset}>
            <Text style={s.btnText}>Try Again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.white },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.sp16, paddingVertical: T.sp12, borderBottomWidth: 1, borderColor: T.divider },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backArrow: { fontSize: 24, color: T.black },
  topBarTitle: { fontSize: T.fs18, fontWeight: '700', color: T.black, fontFamily: T.font },
  
  infoBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: T.sp32, gap: T.sp24 },
  nameTag: { fontSize: T.fs24, fontWeight: '700', color: T.black, fontFamily: T.font },
  
  permBox: { flex: 1, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center', padding: T.sp32, gap: T.sp16 },
  permTitle: { fontSize: T.fs24, fontWeight: '700', color: T.black, fontFamily: T.font, textAlign: 'center' },
  permSub: { fontSize: T.fs14, color: T.muted, fontFamily: T.font, textAlign: 'center', lineHeight: 22 },
  
  btnYellow: { width: '100%', height: 54, backgroundColor: T.yellow, borderRadius: T.r12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.yellowDark },
  btnText: { fontSize: T.fs16, fontWeight: '700', color: T.black, fontFamily: T.font },

  successBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: T.sp32, gap: T.sp20 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: T.yellow, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.yellowDark },
  successCheck: { fontSize: T.fs32, fontWeight: '700', color: T.black },
  successHeading: { fontSize: T.fs32, fontWeight: '700', color: T.black, fontFamily: T.font },
});
