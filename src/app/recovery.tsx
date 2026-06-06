import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { T } from '../design-system/theme2';
import { deviceRecoveryService } from '../services/DeviceRecoveryService';
import { useAppDispatch } from '../store/hooks';
import BiometricScanner from '../components/BiometricScanner';

type Stage = 'request_otp' | 'verify_otp' | 'liveness' | 'capture' | 'success';

export default function RecoveryScreen() {
  const [stage, setStage] = useState<Stage>('request_otp');
  const [employeeId, setEmployeeId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // For BiometricScanner
  const [captured, setCaptured] = useState(0);
  const required = 1; // Only need 1 live embedding for similarity check

  const handleRequestOTP = async () => {
    if (!employeeId.trim()) {
      setError('Please enter your Employee ID.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const otpCodeResponse = await deviceRecoveryService.requestOTP(employeeId);
      if (otpCodeResponse) {
        Alert.alert('Test Mode OTP', `Your testing OTP is: ${otpCodeResponse}\n\n(In production, this is emailed to the user).`);
        setStage('verify_otp');
      } else {
        setError('Employee ID not found or OTP failed to send.');
      }
    } catch (e) {
      setError('Failed to request OTP. Please check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otpCode.trim() || otpCode.length < 6) {
      setError('Please enter a valid 6-digit OTP.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const token = await deviceRecoveryService.verifyOTP(employeeId, otpCode);
      if (token) {
        setRecoveryToken(token);
        setStage('liveness'); // Move to biometric phase
      } else {
        setError('Invalid or expired OTP.');
      }
    } catch (e) {
      setError('Failed to verify OTP.');
    } finally {
      setBusy(false);
    }
  };

  const onValidFrame = useCallback(async (embedding: Float32Array, confidence: number) => {
    if (stage !== 'capture' || !recoveryToken) return;
    try {
      setCaptured(1);
      const success = await deviceRecoveryService.recoverDevice(recoveryToken, embedding);
      if (success) {
        setStage('success');
      } else {
        throw new Error('Face mismatch. If you believe this is an error, contact IT for a Hard Reset.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Recovery failed.';
      setError(msg);
      // If biometric fails, they must start over or contact IT. We will let them retry scanning once,
      // but the token might be invalidated by the cloud. For UX, we just show the error.
      setCaptured(0);
    }
  }, [stage, recoveryToken]);

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={T.white} />
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </Pressable>
        <Text style={s.screenTitle}>Account Recovery</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.divider} />

      {/* ── Stage: Request OTP ─────────────────────────────────────────────── */}
      {stage === 'request_otp' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.infoScroll} keyboardShouldPersistTaps="handled">
            <Text style={s.stageHeading}>Recover Account</Text>
            <Text style={s.stageSub}>Enter your Employee ID to receive a 6-digit OTP code to your registered email or phone.</Text>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Employee ID</Text>
              <TextInput
                style={s.fieldInput}
                value={employeeId}
                onChangeText={setEmployeeId}
                placeholder="EMP-1024"
                placeholderTextColor={T.muted}
                autoCapitalize="characters"
              />
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [s.btnPrimary, pressed && s.btnPressed, busy && s.btnDisabled]}
              onPress={handleRequestOTP}
              disabled={busy}
            >
              <Text style={s.btnPrimaryText}>{busy ? 'Sending OTP...' : 'Send OTP →'}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── Stage: Verify OTP ─────────────────────────────────────────────── */}
      {stage === 'verify_otp' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.infoScroll} keyboardShouldPersistTaps="handled">
            <Text style={s.stageHeading}>Enter Verification Code</Text>
            <Text style={s.stageSub}>A 6-digit code has been sent to the contact info registered with {employeeId}.</Text>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>OTP Code</Text>
              <TextInput
                style={[s.fieldInput, { fontSize: T.fs24, letterSpacing: 4, textAlign: 'center' }]}
                value={otpCode}
                onChangeText={setOtpCode}
                placeholder="000000"
                placeholderTextColor={T.muted}
                keyboardType="number-pad"
                maxLength={6}
              />
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [s.btnPrimary, pressed && s.btnPressed, busy && s.btnDisabled]}
              onPress={handleVerifyOTP}
              disabled={busy}
            >
              <Text style={s.btnPrimaryText}>{busy ? 'Verifying...' : 'Verify & Continue →'}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── Stage: Liveness & Capture (Biometric Check) ──────────────────────── */}
      {(stage === 'liveness' || stage === 'capture') && (
        <BiometricScanner
          mode="authentication" // We use authentication mode UX (Verifying Identity)
          stage={stage}
          captured={captured}
          requiredCaptures={required}
          error={error}
          onLivenessPassed={() => setStage('capture')}
          onCapture={onValidFrame}
        />
      )}

      {/* ── Stage: Success ──────────────────────────────────────────── */}
      {stage === 'success' && (
        <View style={s.successBox}>
          <View style={s.successIcon}>
            <Text style={s.successCheck}>✓</Text>
          </View>
          <Text style={s.successHeading}>Account Recovered</Text>
          <Text style={s.successSub}>
            Your identity has been verified. Your face templates have been securely migrated to this new device.
          </Text>
          <Pressable
            style={({ pressed }) => [s.btnPrimary, pressed && s.btnPressed, { marginTop: 24, width: '100%' }]}
            onPress={() => router.replace('/home')}
          >
            <Text style={s.btnPrimaryText}>Go to Dashboard</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.white },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.sp16, paddingVertical: T.sp12, borderBottomWidth: 1, borderColor: T.divider },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backArrow: { fontSize: 24, color: T.black },
  screenTitle: { fontSize: T.fs18, fontWeight: '700', color: T.black, fontFamily: T.font },
  divider: { height: 1, backgroundColor: T.divider },

  infoScroll: { padding: T.sp24, paddingBottom: T.sp48, gap: T.sp20 },
  stageHeading: { fontSize: T.fs24, fontWeight: '700', color: T.black, fontFamily: T.font },
  stageSub: { fontSize: T.fs14, color: T.muted, fontFamily: T.font, lineHeight: 20 },

  fieldGroup: { gap: T.sp8 },
  fieldLabel: { fontSize: T.fs13, fontWeight: '600', color: T.black, fontFamily: T.font },
  fieldInput: { borderWidth: 1, borderColor: T.divider, borderRadius: T.r8, padding: T.sp12, fontSize: T.fs16, color: T.black, fontFamily: T.font, backgroundColor: T.white },

  btnPrimary: { backgroundColor: T.yellow, paddingVertical: T.sp16, borderRadius: T.r8, alignItems: 'center', justifyContent: 'center', marginTop: T.sp8, borderWidth: 1.5, borderColor: T.yellowDark },
  btnPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { fontSize: T.fs16, fontWeight: '700', color: T.black, fontFamily: T.font },

  errorText: { fontSize: T.fs13, color: T.error, fontFamily: T.font },

  successBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: T.sp32, gap: T.sp20 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: T.yellow, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.yellowDark },
  successCheck: { fontSize: T.fs32, fontWeight: '700', color: T.black },
  successHeading: { fontSize: T.fs32, fontWeight: '700', color: T.black, fontFamily: T.font },
  successSub: { fontSize: T.fs14, color: T.muted, fontFamily: T.font, textAlign: 'center', lineHeight: 22 },
});
