import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { store } from '../store';
import { login, logout, setProfile } from '../store/slices/authSlices';
import { syncService } from '../services/network/SyncService';
import { appBootstrapService } from '../services/AppBootstrapService';
import { appSessionService } from '../services/AppSessionService';
import { useEffect, useState, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { T } from '../design-system/theme2';

export default function RootLayout() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [launchRoute, setLaunchRoute] = useState<'/' | '/enrollment' | '/scanner' | '/home' | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        await appBootstrapService.initialize();
        if (!mounted) return;
        const launchState = await appSessionService.resolveLaunchState();
        if (!mounted) return;
        if (launchState.isAuthenticated && launchState.user && launchState.sessionId) {
          store.dispatch(login({ user: launchState.user, sessionId: launchState.sessionId, source: 'offline' }));
        } else if (launchState.user) {
          store.dispatch(setProfile(launchState.user));
        } else {
          store.dispatch(logout());
        }
        setLaunchRoute(launchState.route);
        await syncService.startSyncLoop();
        if (mounted) setReady(true);
      } catch (error) {
        if (!mounted) return;
        setBootError(error instanceof Error ? error.message : 'Failed to initialize app');
      }
    })();

    return () => {
      mounted = false;
      syncService.stopSyncLoop();
    };
  }, []);

  const isInitialLaunch = useRef(true);

  useEffect(() => {
    if (!ready || !launchRoute) {
      return;
    }

    const isAuth = store.getState().auth.isAuthenticated;

    // Only redirect using launchRoute on the very first navigation
    if (isInitialLaunch.current) {
      isInitialLaunch.current = false;
      if (launchRoute !== '/' && (pathname === '/' || pathname === '/index')) {
        router.replace(launchRoute as any);
        return;
      }
    }

    // Normal guard rules for all subsequent navigations
    if (pathname === '/' || pathname === '/index') {
      if (isAuth) {
        router.replace('/home');
      }
      return;
    }

    const signedInRoutes = ['/home', '/attendance', '/admin', '/states'];
    if (!isAuth && signedInRoutes.includes(pathname)) {
      router.replace('/');
      return;
    }

    if (isAuth && pathname === '/enrollment') {
      router.replace('/home');
    }
  }, [launchRoute, pathname, ready]);

  if (bootError) {
    return (
      <Provider store={store}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.white, padding: 24 }}>
          <Text style={{ color: T.black, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
            App startup failed
          </Text>
          <Text style={{ color: T.muted, textAlign: 'center' }}>
            {bootError}
          </Text>
        </View>
      </Provider>
    );
  }

  if (!ready) {
    return (
      <Provider store={store}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.white }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: T.yellow, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: T.black }}>A</Text>
          </View>
          <ActivityIndicator size="large" color={T.yellow} />
          <Text style={{ color: T.muted, marginTop: 16, fontSize: 13, fontFamily: T.font }}>
            Initializing secure workspace…
          </Text>
        </View>
      </Provider>
    );
  }

  return (
    <Provider store={store}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="index" options={{ title: 'Authentication' }} />
        <Stack.Screen name="scanner" options={{ title: 'Verification' }} />
        <Stack.Screen name="home" options={{ title: 'Dashboard' }} />
        <Stack.Screen name="attendance" options={{ title: 'Activity Logs' }} />
        <Stack.Screen name="enrollment" options={{ title: 'Profile & Settings' }} />
        <Stack.Screen name="admin" options={{ title: 'Admin' }} />
        <Stack.Screen name="states" options={{ title: 'System States' }} />
      </Stack>
    </Provider>
  );
}
