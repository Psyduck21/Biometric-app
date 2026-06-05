import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StatusBar,
  Modal,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSelector } from 'react-redux';
import * as Location from 'expo-location';
import { useAppDispatch } from '../store/hooks';
import { RootState } from '../store';
import { logout } from '../store/slices/authSlices';
import { T } from '../design-system/theme2';

import { AttendanceRecord } from '../types/domain';
import { AttendanceRepository } from '../database/repositories/AttendanceRepository';
import { SessionRepository } from '../database/repositories/SessionRepository';
import { attendanceService } from '../services/AttendanceService';
import { Calendar } from '../components/Calendar';

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
function formatDateTime(ts: number) {
  return `${formatDate(ts)} · ${formatTime(ts)}`;
}

// ── Profile drawer ───────────────────────────────────────────────────────────
function ProfileDrawer({
  visible,
  user,
  onClose,
  onLogout,
}: {
  visible: boolean;
  user: any;
  onClose: () => void;
  onLogout: () => void;
}) {
  const slideX = useRef(new Animated.Value(320)).current;
  useEffect(() => {
    Animated.spring(slideX, {
      toValue: visible ? 0 : 320,
      friction: 20, tension: 180, useNativeDriver: true,
    }).start();
  }, [visible]);

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <Pressable style={s.drawerBackdrop} onPress={onClose}>
        <Animated.View style={[s.drawer, { transform: [{ translateX: slideX }] }]}>
          <Pressable onPress={() => {}} style={{ flex: 1 }}>
            {/* Close */}
            <Pressable onPress={onClose} style={s.drawerClose}>
              <Text style={s.drawerCloseText}>✕</Text>
            </Pressable>

            {/* Avatar */}
            <View style={s.drawerAvatar}>
              <Text style={s.drawerInitials}>{initials}</Text>
            </View>

            <Text style={s.drawerName}>{user?.full_name ?? '—'}</Text>
            <Text style={s.drawerSub}>{user?.employee_id ?? '—'}</Text>
            <Text style={s.drawerSub}>{user?.role ?? 'Employee'}</Text>

            <View style={s.drawerDivider} />

            {/* Info rows */}
            {[
              { label: 'Department',  value: user?.department ?? 'Workspace' },
              { label: 'Status',      value: user?.status ?? 'Active' },
              { label: 'Enrolled at', value: user?.enrolled_at ? formatDate(user.enrolled_at) : '—' },
            ].map(row => (
              <View key={row.label} style={s.drawerRow}>
                <Text style={s.drawerRowLabel}>{row.label}</Text>
                <Text style={s.drawerRowValue}>{row.value}</Text>
              </View>
            ))}

            <View style={s.drawerDivider} />

            <Pressable
              style={({ pressed }) => [s.logoutBtn, pressed && { opacity: 0.8 }]}
              onPress={onLogout}
            >
              <Text style={s.logoutText}>Sign out</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ── Attendance card ─────────────────────────────────────────────────────────
function AttendanceCard({ record }: { record: AttendanceRecord }) {
  const isIn = record.event_type === 'check_in';
  return (
    <View style={s.attCard}>
      <View style={[s.attDot, { backgroundColor: isIn ? T.success : T.muted }]} />
      <View style={{ flex: 1 }}>
        <Text style={s.attType}>{isIn ? 'Check in' : 'Check out'}</Text>
        <Text style={s.attTime}>{formatDateTime(record.timestamp)}</Text>
        <Text style={s.attLocation}>📍 {record.notes || 'Unknown location'}</Text>
      </View>
      <View style={s.attScore}>
        <Text style={s.attScoreNum}>{Math.round(record.similarity_score * 100)}%</Text>
        <Text style={s.attScoreLabel}>match</Text>
      </View>
    </View>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const dispatch    = useAppDispatch();
  const currentUser = useSelector((state: RootState) => state.auth.currentUser);
  const sessionId   = useSelector((state: RootState) => state.auth.activeSessionId);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [records, setRecords]       = useState<AttendanceRecord[]>([]);
  const [locationLabel, setLocLabel]= useState('Fetching location…');
  
  // Historical state
  const [activeTab, setActiveTab]   = useState<'today' | 'history'>('today');
  const [historicalRecords, setHistoricalRecords] = useState<AttendanceRecord[]>([]);
  const [markedDates, setMarkedDates] = useState<number[]>([]);
  const [selectedDate, setSelectedDate] = useState<number>(Date.now());
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);

  const { justAuthenticated } = useLocalSearchParams<{ justAuthenticated?: string }>();

  const fadeIn = useRef(new Animated.Value(0)).current;

  // Intercept Android hardware back button to exit app instead of going to login
  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        BackHandler.exitApp();
        return true;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  // Load saved attendance records from the local database
  const loadRecords = async () => {
    if (!currentUser) return;
    try {
      const todayRecords = await AttendanceRepository.getTodayAttendance(currentUser.id);
      setRecords(todayRecords);
    } catch (e) {
      console.warn('Failed to load attendance records:', e);
    }
  };

  const loadHistoricalDay = async (dateTs: number) => {
    if (!currentUser) return;
    try {
      const startOfDay = new Date(dateTs);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateTs);
      endOfDay.setHours(23, 59, 59, 999);
      
      const dayRecords = await AttendanceRepository.getAttendanceByDateRange(
        currentUser.id,
        startOfDay.getTime(),
        endOfDay.getTime()
      );
      setHistoricalRecords(dayRecords);
    } catch (e) {
      console.warn('Failed to load historical day:', e);
    }
  };

  const handleMonthChange = async (year: number, month: number) => {
    if (!currentUser) return;
    setIsSyncingHistory(true);
    try {
      // 1. Sync cloud
      await attendanceService.syncHistoricalMonth(currentUser.id, year, month);
      
      // 2. Fetch all records for this month to populate marked dots
      const startOfMonth = new Date(year, month, 1).getTime();
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
      const monthRecords = await AttendanceRepository.getAttendanceByDateRange(
        currentUser.id,
        startOfMonth,
        endOfMonth
      );
      
      setMarkedDates(monthRecords.map(r => r.timestamp));
      
      // Reload selected day just in case it was updated by the sync
      loadHistoricalDay(selectedDate);
    } catch (e) {
      console.error('Failed to sync month:', e);
    } finally {
      setIsSyncingHistory(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [currentUser]);

  // Fetch location independently on mount so the dashboard always shows where you are
  useEffect(() => {
    const fetchLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const geo = await Location.reverseGeocodeAsync(pos.coords);
          const place = geo[0];
          const label = [place?.street, place?.city, place?.region].filter(Boolean).join(', ') || 'Unknown location';
          setLocLabel(label);
        } else {
          setLocLabel('Location permission denied');
        }
      } catch {
        setLocLabel('Location unavailable');
      }
    };
    fetchLocation();
  }, []);

  // Only mark attendance when coming from a real biometric login
  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    if (justAuthenticated === '1') {
      markAttendance();
    }
  }, [justAuthenticated]);

  const markAttendance = async () => {
    if (!sessionId || !currentUser) return;

    let locLabel = 'Location unavailable';
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const geo = await Location.reverseGeocodeAsync(pos.coords);
        const place = geo[0];
        locLabel = [place?.street, place?.city, place?.region]
          .filter(Boolean).join(', ') || 'Unknown location';
      }
    } catch {}

    setLocLabel(locLabel);

    try {
      const session = await SessionRepository.getById(sessionId);
      if (!session) return;

      // This creates the record, persists it to DB, and enqueues it for sync
      const record = await attendanceService.recordAttendance(session, 'check_in', locLabel);
      
      // Update UI with the newly created real record
      setRecords(prev => [record, ...prev]);
    } catch (e) {
      console.error('Failed to record attendance:', e);
    }
  };

  const handleLogout = () => {
    setDrawerOpen(false);
    dispatch(logout());
    router.replace('/');
  };

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
               'Good evening';

  const firstName = currentUser?.full_name?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={T.white} />

      {/* ── Top accent ── */}
      <View style={s.topAccent} />

      {/* ── Header ── */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{greeting}</Text>
          <Text style={s.firstName}>{firstName}</Text>
        </View>
        {/* Profile icon */}
        <Pressable
          style={({ pressed }) => [s.profileBtn, pressed && { opacity: 0.7 }]}
          onPress={() => setDrawerOpen(true)}
          accessibilityLabel="Open profile"
        >
          <Text style={s.profileInitials}>
            {currentUser?.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'}
          </Text>
        </Pressable>
      </View>

      <View style={s.divider} />

      <Animated.View style={[{ flex: 1 }, { opacity: fadeIn }]}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ── Tab Control ── */}
          <View style={s.tabContainer}>
            <Pressable 
              onPress={() => setActiveTab('today')}
              style={[s.tabBtn, activeTab === 'today' && s.tabBtnActive]}
            >
              <Text style={[s.tabText, activeTab === 'today' && s.tabTextActive]}>Today</Text>
            </Pressable>
            <Pressable 
              onPress={() => setActiveTab('history')}
              style={[s.tabBtn, activeTab === 'history' && s.tabBtnActive]}
            >
              <Text style={[s.tabText, activeTab === 'history' && s.tabTextActive]}>History</Text>
            </Pressable>
          </View>

          {activeTab === 'today' ? (
            <>
              {/* ── Today card ── */}
              <View style={s.todayCard}>
                <View style={s.todayLeft}>
                  <Text style={s.todayLabel}>Today</Text>
                  <Text style={s.todayDate}>{formatDate(Date.now())}</Text>
                </View>
                <View style={s.todayRight}>
                  <View style={s.statusPill}>
                    <View style={[s.statusDot, { backgroundColor: T.success }]} />
                    <Text style={s.statusPillText}>Authenticated</Text>
                  </View>
                </View>
              </View>

              {/* ── Stats row ── */}
              <View style={s.statsRow}>
                <View style={s.statBox}>
                  <Text style={s.statValue}>{records.length}</Text>
                  <Text style={s.statLabel}>Total today</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statBox}>
                  <Text style={s.statValue}>
                    {records.length > 0 ? formatTime(records[records.length - 1].timestamp) : '—'}
                  </Text>
                  <Text style={s.statLabel}>First in</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statBox}>
                  <Text style={s.statValue}>{records[0] ? formatTime(records[0].timestamp) : '—'}</Text>
                  <Text style={s.statLabel}>Last event</Text>
                </View>
              </View>

              {/* ── Location ── */}
              <View style={s.locationRow}>
                <Text style={s.locationIcon}>📍</Text>
                <Text style={s.locationText} numberOfLines={1}>{locationLabel}</Text>
              </View>

              {/* ── Attendance list ── */}
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>Attendance log</Text>
                <Text style={s.sectionCount}>{records.length} records</Text>
              </View>

              {records.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyIcon}>⏳</Text>
                  <Text style={s.emptyText}>No records yet today</Text>
                </View>
              ) : (
                records.map(r => <AttendanceCard key={r.id} record={r} />)
              )}

              {/* ── Quick actions ── */}
              <View style={s.actionsRow}>
                <Pressable
                  style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push('/scanner')}
                >
                  <Text style={s.actionIcon}>⊙</Text>
                  <Text style={s.actionLabel}>Scan again</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.8 }]}
                  onPress={() => setDrawerOpen(true)}
                >
                  <Text style={s.actionIcon}>☰</Text>
                  <Text style={s.actionLabel}>Profile</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              {/* ── History Tab ── */}
              <Calendar 
                onMonthChange={handleMonthChange}
                onDateSelect={(ts) => {
                  setSelectedDate(ts);
                  loadHistoricalDay(ts);
                }}
                markedDates={markedDates}
              />

              <View style={[s.sectionHeader, { marginTop: T.sp8 }]}>
                <Text style={s.sectionTitle}>Logs for {formatDate(selectedDate)}</Text>
                {isSyncingHistory ? (
                  <Text style={s.sectionCount}>Syncing...</Text>
                ) : (
                  <Text style={s.sectionCount}>{historicalRecords.length} records</Text>
                )}
              </View>

              {historicalRecords.length === 0 ? (
                <View style={s.emptyBox}>
                  <Text style={s.emptyIcon}>📅</Text>
                  <Text style={s.emptyText}>No attendance on this date</Text>
                </View>
              ) : (
                historicalRecords.map(r => <AttendanceCard key={r.id} record={r} />)
              )}
            </>
          )}

        </ScrollView>
      </Animated.View>

      {/* ── Profile drawer ── */}
      <ProfileDrawer
        visible={drawerOpen}
        user={currentUser}
        onClose={() => setDrawerOpen(false)}
        onLogout={handleLogout}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: T.white },
  topAccent:     { height: 3, backgroundColor: T.yellow },
  header:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: T.sp20, paddingVertical: T.sp16 },
  greeting:      { fontSize: T.fs13, color: T.muted, fontFamily: T.font },
  firstName:     { fontSize: T.fs28, fontWeight: '700', color: T.black, fontFamily: T.font, lineHeight: 34 },
  profileBtn:    { width: 44, height: 44, borderRadius: 22, backgroundColor: T.yellow, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: T.yellowDark },
  profileInitials:{ fontSize: T.fs14, fontWeight: '700', color: T.black, fontFamily: T.font },
  divider:       { height: 1, backgroundColor: T.hairline },
  scroll:        { padding: T.sp20, gap: T.sp16, paddingBottom: T.sp40 },

  // Today card
  todayCard:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: T.yellow, borderRadius: T.r12, padding: T.sp16, backgroundColor: T.yellowLight },
  todayLeft:     { gap: T.sp4 },
  todayLabel:    { fontSize: T.fs11, fontWeight: '600', color: T.muted, letterSpacing: 1, textTransform: 'uppercase', fontFamily: T.font },
  todayDate:     { fontSize: T.fs20, fontWeight: '700', color: T.black, fontFamily: T.font },
  todayRight:    {},
  statusPill:    { flexDirection: 'row', alignItems: 'center', gap: T.sp6, backgroundColor: T.white, paddingHorizontal: T.sp10, paddingVertical: T.sp6, borderRadius: T.r999, borderWidth: 1, borderColor: T.hairline },
  statusDot:     { width: 7, height: 7, borderRadius: 4 },
  statusPillText:{ fontSize: T.fs12, fontWeight: '600', color: T.black, fontFamily: T.font },

  // Stats
  statsRow:      { flexDirection: 'row', borderWidth: 1, borderColor: T.hairline, borderRadius: T.r12, overflow: 'hidden' },
  statBox:       { flex: 1, alignItems: 'center', paddingVertical: T.sp16, gap: T.sp4 },
  statDivider:   { width: 1, backgroundColor: T.hairline },
  statValue:     { fontSize: T.fs20, fontWeight: '700', color: T.black, fontFamily: T.font },
  statLabel:     { fontSize: T.fs11, color: T.muted, fontFamily: T.font, textAlign: 'center' },

  // Location
  locationRow:   { flexDirection: 'row', alignItems: 'center', gap: T.sp8, backgroundColor: T.offWhite, borderRadius: T.r8, paddingHorizontal: T.sp12, paddingVertical: T.sp10, borderWidth: 1, borderColor: T.hairline },
  locationIcon:  { fontSize: T.fs14 },
  locationText:  { flex: 1, fontSize: T.fs13, color: T.charcoal, fontFamily: T.font },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle:  { fontSize: T.fs14, fontWeight: '700', color: T.black, fontFamily: T.font, letterSpacing: 0.2 },
  sectionCount:  { fontSize: T.fs12, color: T.muted, fontFamily: T.font },

  // Attendance card
  attCard:       { flexDirection: 'row', alignItems: 'center', gap: T.sp12, borderWidth: 1, borderColor: T.hairline, borderRadius: T.r12, padding: T.sp14, backgroundColor: T.white },
  attDot:        { width: 10, height: 10, borderRadius: 5 },
  attType:       { fontSize: T.fs14, fontWeight: '700', color: T.black, fontFamily: T.font },
  attTime:       { fontSize: T.fs12, color: T.muted, fontFamily: T.font, marginTop: 2 },
  attLocation:   { fontSize: T.fs11, color: T.muted, fontFamily: T.font, marginTop: 2 },
  attScore:      { alignItems: 'center' },
  attScoreNum:   { fontSize: T.fs16, fontWeight: '700', color: T.black, fontFamily: T.font },
  attScoreLabel: { fontSize: T.fs10, color: T.muted, fontFamily: T.font },

  // Empty state
  emptyBox:      { alignItems: 'center', paddingVertical: T.sp32, gap: T.sp8 },
  emptyIcon:     { fontSize: T.fs28 },
  emptyText:     { fontSize: T.fs14, color: T.muted, fontFamily: T.font },

  // Quick actions
  actionsRow:    { flexDirection: 'row', gap: T.sp12 },
  actionBtn:     { flex: 1, borderWidth: 1.5, borderColor: T.hairline, borderRadius: T.r12, paddingVertical: T.sp16, alignItems: 'center', gap: T.sp6, backgroundColor: T.offWhite },
  actionIcon:    { fontSize: T.fs20, color: T.black },
  actionLabel:   { fontSize: T.fs12, color: T.charcoal, fontFamily: T.font, fontWeight: '600' },

  // Drawer
  drawerBackdrop:{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end', flexDirection: 'row' },
  drawer:        { width: 300, backgroundColor: T.white, height: '100%', padding: T.sp24, shadowColor: T.black, shadowOpacity: 0.2, shadowRadius: 20, elevation: 16 },
  drawerClose:   { alignSelf: 'flex-end', width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginBottom: T.sp16 },
  drawerCloseText:{ fontSize: T.fs16, color: T.muted },
  drawerAvatar:  { width: 64, height: 64, borderRadius: 32, backgroundColor: T.yellow, alignItems: 'center', justifyContent: 'center', marginBottom: T.sp12, borderWidth: 1.5, borderColor: T.yellowDark },
  drawerInitials:{ fontSize: T.fs20, fontWeight: '700', color: T.black, fontFamily: T.font },
  drawerName:    { fontSize: T.fs18, fontWeight: '700', color: T.black, fontFamily: T.font },
  drawerSub:     { fontSize: T.fs13, color: T.muted, fontFamily: T.font, marginTop: 2 },
  drawerDivider: { height: 1, backgroundColor: T.hairline, marginVertical: T.sp16 },
  drawerRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: T.sp8 },
  drawerRowLabel:{ fontSize: T.fs12, color: T.muted, fontFamily: T.font },
  drawerRowValue:{ fontSize: T.fs13, fontWeight: '600', color: T.black, fontFamily: T.font },
  logoutBtn:     { marginTop: T.sp8, height: 48, borderWidth: 1.5, borderColor: T.error, borderRadius: T.r8, alignItems: 'center', justifyContent: 'center' },
  logoutText:    { fontSize: T.fs14, fontWeight: '600', color: T.error, fontFamily: T.font },

  // Tabs
  tabContainer:  { flexDirection: 'row', backgroundColor: T.offWhite, borderRadius: T.r12, padding: 4, borderWidth: 1, borderColor: T.hairline },
  tabBtn:        { flex: 1, paddingVertical: T.sp10, alignItems: 'center', borderRadius: T.r8 },
  tabBtnActive:  { backgroundColor: T.white, shadowColor: T.black, shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tabText:       { fontSize: T.fs13, fontWeight: '600', color: T.muted, fontFamily: T.font },
  tabTextActive: { color: T.black },
});
