import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
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
import { appSessionService } from '../services/AppSessionService';
import { enrollmentService } from '../services/EnrollmentService';
import { useAppDispatch } from '../store/hooks';
import { setProfile } from '../store/slices/authSlices';
import BiometricScanner from '../components/BiometricScanner';

type Stage = 'checking_device' | 'info' | 'capture' | 'liveness' | 'success' | 'failed';

// ── Step indicator ─────────────────────────────────────────────────────────
function StepRow({ current }: { current: number }) {
  const labels = ['Profile', 'Face scan', 'Liveness'];
  return (
    <View style={s.stepRow}>
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <View style={s.stepItem}>
              <View style={[
                s.stepDot,
                done && s.stepDotDone,
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

// ── Main component ─────────────────────────────────────────────────────────
export default function EnrollmentScreen() {
  const dispatch = useAppDispatch();

  const [stage, setStage] = useState<Stage>('checking_device');
  const [fullName, setFullName] = useState('');
  const [employeeId, setEmpId] = useState('');
  const [email, setEmail] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [offlineBlocked, setOfflineBlocked] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [captured, setCaptured] = useState(0);
  const [required, setRequired] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stage === 'checking_device') {
      appSessionService.checkCloudDeviceBinding()
        .then(user => {
          if (user) {
            setFullName(user.full_name || '');
            setEmpId(user.employee_id || '');
            let parsedEmail = '';
            try {
              if (user.metadata) {
                const meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata) : user.metadata;
                parsedEmail = meta.email || '';
              }
            } catch (e) {}
            setEmail(parsedEmail);
            setIsLocked(true);
          }
          setStage('info');
        })
        .catch(err => {
          if (err.message === 'offline') {
            setOfflineBlocked(true);
          } else {
            setStage('info');
          }
        });
    }
  }, [stage]);

  // ── Step 1 submit ──────────────────────────────────────────────────────
  const handleContinue = async () => {
    if (!fullName.trim() || !employeeId.trim() || !email.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (fullName.trim().length < 2) {
      setError('Name must be at least 2 characters.');
      return;
    }
    const empIdRegex = /^EMP\d{3,4}$/;
    if (!empIdRegex.test(employeeId.trim())) {
      setError('Employee ID must be EMP followed by 3 or 4 digits.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy(true); setError(null);
    try {
      const user = await appSessionService.registerUser({ fullName, employeeId, email });
      dispatch(setProfile(user));
      setProfileId(user.id);
      
      const session = await enrollmentService.startEnrollment(user.id);
      setSessionId(session.sessionId);
      setRequired(session.requiredSamples);
      setCaptured(session.capturedSamples);
      setStage('capture');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create profile.';
      if (msg === 'storage_error') {
        setError('A secure storage error occurred. Please clear the app storage from your device settings and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Step 2: Face capture (anti-spoof + embed) ─────────────────────────
  // Accumulates samples but does NOT finalize — waits for liveness to pass first.
  const onValidFrame = useCallback(async (embedding: Float32Array, confidence: number) => {
    if (stage !== 'capture' || !sessionId) return;
    try {
      const updated = await enrollmentService.addSample(sessionId, "" as any, embedding, confidence);
      setCaptured(updated.capturedSamples);

      // All samples captured — move to liveness stage (finalize happens after liveness)
      if (updated.capturedSamples >= updated.requiredSamples) {
        setStage('liveness');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Capture failed.';
      if (msg === 'storage_error') {
        setError('A secure storage error occurred. Please clear the app storage from your device settings and try again.');
        setCaptured(0);
      } else {
        setError(`${msg} Retrying...`);
        setCaptured(0);
      }
      
      if (profileId) {
        enrollmentService.startEnrollment(profileId)
          .then(newSession => setSessionId(newSession.sessionId))
          .catch(err => setError('Failed to restart session. Please go back.'));
      }
    }
  }, [stage, sessionId, profileId]);

  // ── Step 3: Liveness passed → finalize enrollment ──────────────────────
  const onEnrollmentLivenessPassed = useCallback(async () => {
    if (!sessionId) return;
    try {
      const result = await enrollmentService.finalizeEnrollment(sessionId);
      if (!result.success) throw new Error(result.failureReason ?? 'Enrollment failed.');
      setStage('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Enrollment failed.';
      setError(msg === 'storage_error'
        ? 'A secure storage error occurred. Please clear the app storage from your device settings and try again.'
        : msg
      );
      // Reset capture so the user restarts from face scan
      setCaptured(0);
      if (profileId) {
        enrollmentService.startEnrollment(profileId)
          .then(newSession => {
            setSessionId(newSession.sessionId);
            setStage('capture');
          })
          .catch(() => setError('Failed to restart session. Please go back.'));
      }
    }
  }, [sessionId, profileId]);

  const stageIndex = stage === 'info' ? 0 : stage === 'capture' ? 1 : stage === 'liveness' ? 2 : 3;

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

      {/* ── Stage: Checking Device ──────────────────────────────────────────── */}
      {stage === 'checking_device' && (
        <View style={s.centerBox}>
          <ActivityIndicator size="large" color={T.yellow} />
          <Text style={[s.stageHeading, { marginTop: T.sp24 }]}>Verifying device...</Text>
          <Text style={s.stageSub}>Checking security tethering.</Text>
        </View>
      )}

      {/* ── Stage: Info ─────────────────────────────────────────────── */}
      {stage === 'info' && offlineBlocked && (
        <View style={s.centerBox}>
          <View style={[s.successIcon, { backgroundColor: T.error }]}>
            <Text style={s.successCheck}>!</Text>
          </View>
          <Text style={s.stageHeading}>Internet Required</Text>
          <Text style={[s.stageSub, { textAlign: 'center', marginHorizontal: T.sp24 }]}>
            This device has been cleared. For security reasons, you must be connected to the internet for the initial device verification.
          </Text>
          <Pressable
            style={({ pressed }) => [s.btnPrimary, pressed && s.btnPressed, { marginTop: 24, paddingHorizontal: 32 }]}
            onPress={() => setStage('checking_device')}
          >
            <Text style={s.btnPrimaryText}>Try Again</Text>
          </Pressable>
        </View>
      )}

      {stage === 'info' && !offlineBlocked && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={s.infoScroll} keyboardShouldPersistTaps="handled">
            <Text style={s.stageHeading}>
              {isLocked ? `Welcome back, ${fullName.split(' ')[0]}` : 'Tell us about yourself'}
            </Text>
            <Text style={s.stageSub}>
              {isLocked 
                ? 'This device is securely tethered to your identity. Please confirm your details and re-enroll your face.' 
                : 'Your details are stored securely on this device only.'}
            </Text>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Full name</Text>
              <TextInput
                style={[s.fieldInput, isLocked && s.fieldInputLocked]}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Ava Johnson"
                placeholderTextColor={T.muted}
                autoCapitalize="words"
                editable={!isLocked}
              />
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Employee ID</Text>
              <TextInput
                style={[s.fieldInput, isLocked && s.fieldInputLocked]}
                value={employeeId}
                onChangeText={setEmpId}
                placeholder="EMP-1024"
                placeholderTextColor={T.muted}
                autoCapitalize="characters"
                editable={!isLocked}
              />
            </View>

            <View style={s.fieldGroup}>
              <Text style={s.fieldLabel}>Work email</Text>
              <TextInput
                style={[s.fieldInput, isLocked && s.fieldInputLocked]}
                value={email}
                onChangeText={setEmail}
                placeholder="ava@company.com"
                placeholderTextColor={T.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!isLocked}
              />
            </View>

            {error ? <Text style={s.errorText}>{error}</Text> : null}

            <Pressable
              style={({ pressed }) => [s.btnPrimary, pressed && s.btnPressed, busy && s.btnDisabled]}
              onPress={handleContinue}
              disabled={busy}
            >
              <Text style={s.btnPrimaryText}>{busy ? (isLocked ? 'Restoring profile…' : 'Creating profile…') : 'Continue →'}</Text>
            </Pressable>

            {!isLocked && (
              <Pressable onPress={() => router.push('/scanner')} style={s.linkBtn}>
                <Text style={s.linkText}>Already enrolled? Sign in instead</Text>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* ── Stage: Capture & Liveness ──────────────────────────────────────────── */}
      {(stage === 'capture' || stage === 'liveness') && (
        <BiometricScanner
          mode="enrollment"
          stage={stage}
          captured={captured}
          requiredCaptures={required}
          error={error}
          onLivenessPassed={onEnrollmentLivenessPassed}
          onCapture={onValidFrame}
        />
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
            style={({ pressed }) => [s.btnPrimary, pressed && s.btnPressed, { marginTop: 24 }]}
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

  stepRow: { flexDirection: 'row', paddingHorizontal: T.sp32, paddingVertical: T.sp16, justifyContent: 'space-between', alignItems: 'center' },
  stepItem: { alignItems: 'center', gap: T.sp4 },
  stepDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: T.divider, alignItems: 'center', justifyContent: 'center' },
  stepDotActive: { backgroundColor: T.black },
  stepDotDone: { backgroundColor: T.yellow },
  stepCheck: { color: T.white, fontSize: T.fs13, fontWeight: '700' },
  stepNum: { color: T.muted, fontSize: T.fs13, fontWeight: '600', fontFamily: T.font },
  stepNumActive: { color: T.white },
  stepLabel: { fontSize: T.fs12, color: T.muted, fontFamily: T.font, fontWeight: '500' },
  stepLabelActive: { color: T.black, fontWeight: '700' },
  stepLine: { flex: 1, height: 2, backgroundColor: T.divider, marginHorizontal: T.sp8, marginTop: -16 },
  stepLineDone: { backgroundColor: T.yellow },

  infoScroll: { padding: T.sp24, paddingBottom: T.sp48, gap: T.sp20 },
  stageHeading: { fontSize: T.fs24, fontWeight: '700', color: T.black, fontFamily: T.font },
  stageSub: { fontSize: T.fs14, color: T.muted, fontFamily: T.font, lineHeight: 20 },

  fieldGroup: { gap: T.sp8 },
  fieldLabel: { fontSize: T.fs13, fontWeight: '600', color: T.black, fontFamily: T.font },
  fieldInput: { borderWidth: 1, borderColor: T.divider, borderRadius: T.r8, padding: T.sp12, fontSize: T.fs16, color: T.black, fontFamily: T.font, backgroundColor: T.white },
  fieldInputLocked: { backgroundColor: T.offWhite, color: T.muted },

  btnPrimary: { backgroundColor: T.yellow, paddingVertical: T.sp16, borderRadius: T.r8, alignItems: 'center', justifyContent: 'center', marginTop: T.sp8, borderWidth: 1.5, borderColor: T.yellowDark },
  btnPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { fontSize: T.fs16, fontWeight: '700', color: T.black, fontFamily: T.font },
  linkBtn: { alignItems: 'center', paddingVertical: T.sp8 },
  linkText: { fontSize: T.fs13, color: T.muted, fontFamily: T.font, textDecorationLine: 'underline' },

  errorText: { fontSize: T.fs13, color: T.error, fontFamily: T.font },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: T.sp32, gap: T.sp8 },
  successBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: T.sp32, gap: T.sp20 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: T.yellow, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.yellowDark },
  successCheck: { fontSize: T.fs32, fontWeight: '700', color: T.black },
  successHeading: { fontSize: T.fs32, fontWeight: '700', color: T.black, fontFamily: T.font },
  successSub: { fontSize: T.fs14, color: T.muted, fontFamily: T.font, textAlign: 'center', lineHeight: 22 },
});
