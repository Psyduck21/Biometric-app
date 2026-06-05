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

type Stage = 'info' | 'liveness' | 'capture' | 'success' | 'failed';

// ── Step indicator ─────────────────────────────────────────────────────────
function StepRow({ current }: { current: number }) {
  const labels = ['Profile', 'Liveness', 'Face scan'];
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

  const [stage, setStage] = useState<Stage>('info');
  const [fullName, setFullName] = useState('');
  const [employeeId, setEmpId] = useState('');
  const [email, setEmail] = useState('');
  const [profileId, setProfileId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [captured, setCaptured] = useState(0);
  const [required, setRequired] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setProfileId(user.id);
      
      const session = await enrollmentService.startEnrollment(user.id);
      setSessionId(session.sessionId);
      setRequired(session.requiredSamples);
      setCaptured(session.capturedSamples);
      setStage('liveness');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create profile.');
    } finally {
      setBusy(false);
    }
  };

  // ── Step 2 Automatic Capture ───────────────────────────────────────────
  const onValidFrame = useCallback(async (embedding: Float32Array, confidence: number) => {
    if (stage !== 'capture' || !sessionId) return;
    try {
      const updated = await enrollmentService.addSample(sessionId, "" as any, embedding, confidence);
      setCaptured(updated.capturedSamples);

      if (updated.capturedSamples >= updated.requiredSamples) {
        const result = await enrollmentService.finalizeEnrollment(sessionId);
        if (!result.success) throw new Error(result.failureReason ?? 'Enrollment failed.');
        setStage('success');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Capture failed.';
      setError(`${msg} Retrying...`);
      setCaptured(0);
      
      if (profileId) {
        enrollmentService.startEnrollment(profileId)
          .then(newSession => setSessionId(newSession.sessionId))
          .catch(err => setError('Failed to restart session. Please go back.'));
      }
    }
  }, [stage, sessionId, profileId]);

  const stageIndex = stage === 'info' ? 0 : stage === 'liveness' ? 1 : stage === 'capture' ? 2 : 3;

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

      {/* ── Stage: Liveness & Capture ──────────────────────────────────────────── */}
      {(stage === 'liveness' || stage === 'capture') && (
        <BiometricScanner
          mode="enrollment"
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

  btnPrimary: { backgroundColor: T.yellow, paddingVertical: T.sp16, borderRadius: T.r8, alignItems: 'center', justifyContent: 'center', marginTop: T.sp8, borderWidth: 1.5, borderColor: T.yellowDark },
  btnPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { fontSize: T.fs16, fontWeight: '700', color: T.black, fontFamily: T.font },
  linkBtn: { alignItems: 'center', paddingVertical: T.sp8 },
  linkText: { fontSize: T.fs13, color: T.muted, fontFamily: T.font, textDecorationLine: 'underline' },

  errorText: { fontSize: T.fs13, color: T.error, fontFamily: T.font },

  successBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: T.sp32, gap: T.sp20 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: T.yellow, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.yellowDark },
  successCheck: { fontSize: T.fs32, fontWeight: '700', color: T.black },
  successHeading: { fontSize: T.fs32, fontWeight: '700', color: T.black, fontFamily: T.font },
  successSub: { fontSize: T.fs14, color: T.muted, fontFamily: T.font, textAlign: 'center', lineHeight: 22 },
});
