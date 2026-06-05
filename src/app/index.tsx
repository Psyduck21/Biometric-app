import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
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
import { useAppDispatch } from '../store/hooks';
import { setProfile } from '../store/slices/authSlices';
import { User } from '../types/domain';

const NUM_DOTS = 50;

function FloatingDots() {
  const dots = useRef(
    Array.from({ length: NUM_DOTS }).map(() => ({
      x: Math.random() * 100, // %
      y: Math.random() * 100, // %
      size: Math.random() * 4 + 2, // 2 to 6px
      // 20% chance to be a darker yellow
      color: Math.random() > 0.8 ? '#FFB300' : T.yellow,
      animX: new Animated.Value(0),
      animY: new Animated.Value(0),
      animOpacity: new Animated.Value(Math.random() * 0.5 + 0.1),
    }))
  ).current;

  useEffect(() => {
    dots.forEach((dot) => {
      const driftX = (currentX: number) => {
        // Drift to a new random position between -150 and 150 relative to start
        // but biased by current position so it wanders
        let nextX = currentX + (Math.random() - 0.5) * 120;
        if (nextX > 150) nextX = 150 - Math.random() * 50;
        if (nextX < -150) nextX = -150 + Math.random() * 50;

        Animated.timing(dot.animX, {
          toValue: nextX,
          duration: Math.random() * 6000 + 4000,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) driftX(nextX);
        });
      };
      
      const driftY = (currentY: number) => {
        let nextY = currentY + (Math.random() - 0.5) * 120;
        if (nextY > 150) nextY = 150 - Math.random() * 50;
        if (nextY < -150) nextY = -150 + Math.random() * 50;

        Animated.timing(dot.animY, {
          toValue: nextY,
          duration: Math.random() * 6000 + 4000,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) driftY(nextY);
        });
      };

      driftX(0);
      driftY(0);
    });
  }, [dots]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 450, overflow: 'hidden', zIndex: 0 }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: `${dot.x}%`,
            top: `${dot.y}%`,
            width: dot.size,
            height: dot.size,
            borderRadius: dot.size / 2,
            backgroundColor: dot.color,
            opacity: dot.animOpacity,
            transform: [
              { translateX: dot.animX },
              { translateY: dot.animY }
            ],
          }}
        />
      ))}
    </View>
  );
}

function FaceIcon() {
  const scanAnim = useRef(new Animated.Value(0)).current;
  const gridScaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Scan animation loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Grid breathing scale loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(gridScaleAnim, {
          toValue: 1.1,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(gridScaleAnim, {
          toValue: 1,
          duration: 4000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scanAnim]);

  const translateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 100],
  });

  return (
    <View style={s.faceIcon}>
      {/* Face Mesh Image (White Background) */}
      <Image
        source={require('../../assets/images/icon.png')}
        style={{ width: '100%', height: '100%', resizeMode: 'contain', zIndex: 1 }}
      />

      {/* Perfect Corner Brackets */}
      <View style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 3 }}>
        <View style={[s.bracket, s.bracketTL]} />
        <View style={[s.bracket, s.bracketTR]} />
        <View style={[s.bracket, s.bracketBL]} />
        <View style={[s.bracket, s.bracketBR]} />
      </View>

      <Animated.View style={[s.scanOverlayLine, { transform: [{ translateY }], zIndex: 4 }]} />
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
      if (state.isEnrollmentIncomplete && state.user) {
        dispatch(setProfile(state.user as User));
        router.replace({ pathname: '/enrollment', params: { resume: 'true' } } as any);
        return;
      }
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

      {/* Custom Drifting Dots Background */}
      <FloatingDots />

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
    width: 240,
    height: 240,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanOverlayLine: {
    position: 'absolute',
    width: '100%',
    height: 0,
    borderBottomWidth: 2,
    borderStyle: 'dotted',
    borderColor: 'rgba(255, 193, 7, 0.9)',
    zIndex: 10,
    shadowColor: '#FFC107',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 4,
  },
  // Scan brackets
  bracket: { position: 'absolute', width: 24, height: 24 },
  bracketTL: {
    top: 0, left: 0,
    borderTopWidth: 3, borderLeftWidth: 3, borderColor: T.yellow,
    borderTopLeftRadius: T.r6,
  },
  bracketTR: {
    top: 0, right: 0,
    borderTopWidth: 3, borderRightWidth: 3, borderColor: T.yellow,
    borderTopRightRadius: T.r6,
  },
  bracketBL: {
    bottom: 0, left: 0,
    borderBottomWidth: 3, borderLeftWidth: 3, borderColor: T.yellow,
    borderBottomLeftRadius: T.r6,
  },
  bracketBR: {
    bottom: 0, right: 0,
    borderBottomWidth: 3, borderRightWidth: 3, borderColor: T.yellow,
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
