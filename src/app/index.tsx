import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
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
import { RootState } from '../store';
import { User } from '../types/domain';

function FaceIcon() {
  return (
    <View style={s.faceIcon}>
      {/* Outer ring */}
      <View style={s.faceRingOuter} />
      {/* Face oval */}
      <View style={s.faceOval} />
      {/* Eyes */}
      <View style={[s.faceEye, { left: 28, top: 38 }]} />
      <View style={[s.faceEye, { right: 28, top: 38 }]} />
      {/* Nose bridge */}
      <View style={s.faceNose} />
      {/* Mouth arc */}
      <View style={s.faceMouth} />
      {/* Corner scan brackets */}
      <View style={[s.bracket, s.bracketTL]} />
      <View style={[s.bracket, s.bracketTR]} />
      <View style={[s.bracket, s.bracketBL]} />
      <View style={[s.bracket, s.bracketBR]} />
    </View>
  );
}

function PulsingDot() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [scale]);
  return (
    <Animated.View style={[s.pulseDot, { transform: [{ scale }] }]} />
  );
}

export default function HomeScreen() {
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
      } else {
        setResolvedUser(null);
      }
      setEnrollChecked(true);
    });
  }, [currentUser]);

  const isEnrolled = !!resolvedUser;

  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, [fadeIn, slideUp]);

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={T.white} />

      {/* ── Top decorative line ── */}
      <View style={s.topAccent} />

      <Animated.View style={[s.inner, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>

        {/* ── Brand line ── */}
        <View style={s.brandRow}>
          <PulsingDot />
          <Text style={s.brandText}>AEGIS IDENTITY</Text>
        </View>

        {/* ── Hero face icon ── */}
        <View style={s.heroCenter}>
          <FaceIcon />
        </View>

        {/* ── Heading ── */}
        <View style={s.headingBlock}>
          <Text style={s.welcomeLabel}>
            {isEnrolled ? `Welcome back,` : `Welcome`}
          </Text>
          <Text style={s.welcomeName}>
            {isEnrolled ? resolvedUser?.full_name?.split(' ')[0] ?? 'there' : 'to Aegis'}
          </Text>
          <Text style={s.welcomeSub}>
            {isEnrolled
              ? 'Authenticate with your face to mark attendance.'
              : 'Secure, offline-first biometric identity.'}
          </Text>
        </View>

        {/* ── CTA buttons ── */}
        {isEnrolled ? (
          <View style={s.ctaBlock}>
            <Pressable
              style={({ pressed }) => [s.ctaPrimary, pressed && s.ctaPressed]}
              onPress={() => router.push('/scanner')}
              accessibilityRole="button"
              accessibilityLabel="Authenticate with face"
            >
              <Text style={s.ctaPrimaryText}>Authenticate</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.ctaBlock}>
            <Pressable
              style={({ pressed }) => [s.ctaPrimary, pressed && s.ctaPressed]}
              onPress={() => router.push('/enrollment')}
              accessibilityRole="button"
              accessibilityLabel="Enroll your face"
            >
              <Text style={s.ctaPrimaryText}>Get started</Text>
            </Pressable>
            <Text style={s.ctaHint}>First time? Create your biometric profile.</Text>
          </View>
        )}

        {/* ── Bottom tag ── */}
        <View style={s.footer}>
          <View style={s.footerDash} />
          <Text style={s.footerText}>100% offline — no cloud required</Text>
          <View style={s.footerDash} />
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const BRACKET_THICK = 2.5;
const BRACKET_LEN = 16;

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.white,
  },
  topAccent: {
    height: 3,
    backgroundColor: T.yellow,
    width: '100%',
  },
  inner: {
    flex: 1,
    paddingHorizontal: T.sp24,
    paddingTop: T.sp24,
    paddingBottom: T.sp16,
    justifyContent: 'space-between',
  },

  // Brand
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.sp8,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: T.r999,
    backgroundColor: T.yellow,
  },
  brandText: {
    fontSize: T.fs11,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: T.charcoal,
    fontFamily: T.font,
  },

  // Hero face icon
  heroCenter: {
    alignItems: 'center',
    marginVertical: T.sp8,
  },
  faceIcon: {
    width: 160,
    height: 160,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceRingOuter: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    borderWidth: 1,
    borderColor: T.hairline,
    borderStyle: 'dashed',
  },
  faceOval: {
    width: 88,
    height: 108,
    borderRadius: 44,
    borderWidth: BRACKET_THICK,
    borderColor: T.black,
    backgroundColor: 'transparent',
  },
  faceEye: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: T.black,
  },
  faceNose: {
    position: 'absolute',
    top: 55,
    width: 1.5,
    height: 14,
    backgroundColor: T.muted,
  },
  faceMouth: {
    position: 'absolute',
    bottom: 32,
    width: 28,
    height: 12,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderLeftWidth: BRACKET_THICK,
    borderRightWidth: BRACKET_THICK,
    borderBottomWidth: BRACKET_THICK,
    borderColor: T.black,
  },
  // Scan brackets
  bracket: { position: 'absolute', width: BRACKET_LEN, height: BRACKET_LEN },
  bracketTL: {
    top: 8, left: 8,
    borderTopWidth: BRACKET_THICK, borderLeftWidth: BRACKET_THICK, borderColor: T.yellow,
    borderTopLeftRadius: T.r6,
  },
  bracketTR: {
    top: 8, right: 8,
    borderTopWidth: BRACKET_THICK, borderRightWidth: BRACKET_THICK, borderColor: T.yellow,
    borderTopRightRadius: T.r6,
  },
  bracketBL: {
    bottom: 8, left: 8,
    borderBottomWidth: BRACKET_THICK, borderLeftWidth: BRACKET_THICK, borderColor: T.yellow,
    borderBottomLeftRadius: T.r6,
  },
  bracketBR: {
    bottom: 8, right: 8,
    borderBottomWidth: BRACKET_THICK, borderRightWidth: BRACKET_THICK, borderColor: T.yellow,
    borderBottomRightRadius: T.r6,
  },

  // Heading
  headingBlock: {
    gap: T.sp6,
  },
  welcomeLabel: {
    fontSize: T.fs14,
    color: T.muted,
    fontWeight: '400',
    fontFamily: T.font,
  },
  welcomeName: {
    fontSize: T.fs40,
    fontWeight: '700',
    color: T.black,
    fontFamily: T.font,
    lineHeight: 46,
  },
  welcomeSub: {
    fontSize: T.fs14,
    color: T.muted,
    lineHeight: 22,
    fontFamily: T.font,
    marginTop: T.sp4,
  },

  // CTA
  ctaBlock: {
    gap: T.sp12,
  },
  ctaPrimary: {
    height: 56,
    backgroundColor: T.yellow,
    borderRadius: T.r12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: T.yellowDark,
  },
  ctaPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  ctaPrimaryText: {
    fontSize: T.fs16,
    fontWeight: '700',
    color: T.black,
    fontFamily: T.font,
    letterSpacing: 0.3,
  },
  ctaHint: {
    textAlign: 'center',
    fontSize: T.fs12,
    color: T.muted,
    fontFamily: T.font,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.sp10,
    justifyContent: 'center',
  },
  footerDash: {
    flex: 1,
    height: 1,
    backgroundColor: T.hairline,
  },
  footerText: {
    fontSize: T.fs11,
    color: T.muted,
    fontFamily: T.font,
    letterSpacing: 0.5,
  },
});
