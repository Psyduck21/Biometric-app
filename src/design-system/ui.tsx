import React, { ReactNode, useEffect, useMemo } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
  DimensionValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, usePathname } from 'expo-router';

import { resolveTheme, type AppTheme, type ScreenKey } from './theme';

export const workspaceNavItems: {
  key: ScreenKey;
  label: string;
  href: string;
  caption: string;
}[] = [
  { key: 'auth', label: 'Welcome', href: '/', caption: 'Entry' },
  { key: 'profile', label: 'Register', href: '/enrollment', caption: 'First-time setup' },
  { key: 'verification', label: 'Verify', href: '/scanner', caption: 'Liveness check' },
  { key: 'dashboard', label: 'Dashboard', href: '/home', caption: 'Overview' },
  { key: 'logs', label: 'Activity', href: '/attendance', caption: 'History' },
  { key: 'admin', label: 'Settings', href: '/admin', caption: 'Controls' },
];

export function useAppTheme(): AppTheme {
  return resolveTheme(useColorScheme());
}

function getNavLabel(pathname: string) {
  const active = workspaceNavItems.find((item) => {
    if (item.href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(item.href);
  });
  return active ?? workspaceNavItems[3];
}

function ScreenBackdrop() {
  const theme = useAppTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.orb,
          {
            backgroundColor: theme.colors.primary,
            opacity: theme.mode === 'light' ? 0.08 : 0.12,
            top: -140,
            right: -110,
          },
        ]}
      />
      <View
        style={[
          styles.orb,
          {
            backgroundColor: theme.colors.info,
            opacity: theme.mode === 'light' ? 0.06 : 0.08,
            bottom: -160,
            left: -120,
          },
        ]}
      />
      <View
        style={[
          styles.orbSoft,
          {
            backgroundColor: theme.colors.backgroundAlt,
            opacity: theme.mode === 'light' ? 0.8 : 0.35,
            top: 140,
            left: '32%',
          },
        ]}
      />
    </View>
  );
}

export function AppFrame({
  screenKey,
  title,
  eyebrow,
  subtitle,
  children,
  actions,
  showNavigation = true,
  compact = false,
}: {
  screenKey: ScreenKey;
  title: string;
  eyebrow?: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  showNavigation?: boolean;
  compact?: boolean;
}) {
  const theme = useAppTheme();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1080;
  const isTablet = width >= 720;
  const activeNav = getNavLabel(pathname);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.colors.background },
      ]}
    >
      <ScreenBackdrop />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.flex}>
          {showNavigation && isDesktop ? (
            <View
              style={[
                styles.rail,
                {
                  width: theme.layout.railWidth,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.overlay,
                },
              ]}
            >
              <BrandBlock compact={compact} />
              <RailStatus />
              <View style={styles.railNav}>
                {workspaceNavItems.map((item) => (
                  <NavPill
                    key={item.key}
                    active={item.key === screenKey}
                    label={item.label}
                    caption={item.caption}
                    onPress={() => router.push(item.href as any)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.contentPane}>
            <ScrollView
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingHorizontal: isDesktop ? 28 : 18,
                  paddingBottom: isTablet ? 40 : 28,
                },
              ]}
              showsVerticalScrollIndicator={false}
            >
              {!isDesktop ? (
                <View
                  style={[
                    styles.mobileHeader,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.overlay,
                    },
                  ]}
                >
                  <BrandBlock compact />
                  {showNavigation ? (
                    <StatusChip
                      tone="info"
                      label={`${activeNav.label} view`}
                      description="Responsive workspace shell"
                    />
                  ) : null}
                </View>
              ) : null}

              <View
                style={[
                  styles.hero,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: theme.colors.overlay,
                    shadowColor: theme.colors.shadow,
                  },
                ]}
              >
                <View style={styles.heroCopy}>
                  {eyebrow ? (
                    <Text
                      style={[
                        styles.eyebrow,
                        {
                          color: theme.colors.textSecondary,
                          fontFamily: theme.typography.family,
                        },
                      ]}
                    >
                      {eyebrow}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.heroTitle,
                      {
                        color: theme.colors.text,
                        fontFamily: theme.typography.family,
                      },
                    ]}
                  >
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text
                      style={[
                        styles.heroSubtitle,
                        {
                          color: theme.colors.textSecondary,
                          fontFamily: theme.typography.family,
                        },
                      ]}
                    >
                      {subtitle}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.heroActions}>{actions}</View>
              </View>

              {showNavigation && !isDesktop ? (
                <View
                  style={[
                    styles.mobileNav,
                    {
                      borderColor: theme.colors.border,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  {workspaceNavItems.map((item) => (
                    <NavPill
                      key={item.key}
                      active={item.key === screenKey}
                      label={item.label}
                      caption={item.caption}
                      onPress={() => router.push(item.href as any)}
                      compact
                    />
                  ))}
                </View>
              ) : null}

              <View
                style={[
                  styles.content,
                  {
                    maxWidth: theme.layout.pageMaxWidth,
                  },
                ]}
              >
                {children}
              </View>
            </ScrollView>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function BrandBlock({ compact = false }: { compact?: boolean }) {
  const theme = useAppTheme();
  return (
    <View style={styles.brandBlock}>
      <View
        style={[
          styles.brandMark,
          {
            backgroundColor: theme.colors.primary,
            shadowColor: theme.colors.shadow,
          },
        ]}
      >
        <View
          style={[
            styles.brandInner,
            { borderColor: theme.colors.background },
          ]}
        />
      </View>
      <View style={styles.brandCopy}>
        <Text
          style={[
            styles.brandTitle,
            {
              color: theme.colors.text,
              fontFamily: theme.typography.family,
            },
          ]}
        >
          Aegis Identity
        </Text>
        {!compact ? (
          <Text
            style={[
              styles.brandSubtitle,
              {
                color: theme.colors.textSecondary,
                fontFamily: theme.typography.family,
              },
            ]}
            >
            Registration, liveness, and workspace controls
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function RailStatus() {
  return (
    <View style={styles.railStatus}>
      <StatusChip tone="success" label="Offline ready" description="Encrypted on-device data" />
      <StatusChip tone="info" label="Liveness ready" description="Front camera pipeline" />
    </View>
  );
}

export function SectionCard({
  title,
  description,
  eyebrow,
  actions,
  children,
  footer,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.sectionCard,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          shadowColor: theme.colors.shadow,
        },
      ]}
    >
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          {eyebrow ? (
            <Text
              style={[
                styles.sectionEyebrow,
                { color: theme.colors.textSecondary, fontFamily: theme.typography.family },
              ]}
            >
              {eyebrow}
            </Text>
          ) : null}
          <Text
            style={[
              styles.sectionTitle,
              { color: theme.colors.text, fontFamily: theme.typography.family },
            ]}
          >
            {title}
          </Text>
          {description ? (
            <Text
              style={[
                styles.sectionDescription,
                { color: theme.colors.textSecondary, fontFamily: theme.typography.family },
              ]}
            >
              {description}
            </Text>
          ) : null}
        </View>
        {actions ? <View style={styles.sectionActions}>{actions}</View> : null}
      </View>

      {children ? <View style={styles.sectionBody}>{children}</View> : null}
      {footer ? <View style={styles.sectionFooter}>{footer}</View> : null}
    </View>
  );
}

export function StatusChip({
  tone,
  label,
  description,
}: {
  tone: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  label: string;
  description?: string;
}) {
  const theme = useAppTheme();
  const toneStyles = {
    success: { backgroundColor: 'rgba(34, 197, 94, 0.12)', borderColor: 'rgba(34, 197, 94, 0.24)', dot: theme.colors.success },
    warning: { backgroundColor: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.24)', dot: theme.colors.warning },
    error: { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.24)', dot: theme.colors.error },
    info: { backgroundColor: 'rgba(37, 99, 235, 0.12)', borderColor: 'rgba(37, 99, 235, 0.2)', dot: theme.colors.info },
    neutral: { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border, dot: theme.colors.textTertiary },
  }[tone];

  return (
    <View
      style={[
        styles.statusChip,
        {
          backgroundColor: toneStyles.backgroundColor,
          borderColor: toneStyles.borderColor,
        },
      ]}
    >
      <View style={[styles.statusDot, { backgroundColor: toneStyles.dot }]} />
      <View style={styles.statusTextBlock}>
        <Text style={[styles.statusLabel, { color: theme.colors.text, fontFamily: theme.typography.family }]}>
          {label}
        </Text>
        {description ? (
          <Text style={[styles.statusDescription, { color: theme.colors.textSecondary, fontFamily: theme.typography.family }]}>
            {description}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function NavPill({
  active,
  label,
  caption,
  onPress,
  compact = false,
}: {
  active?: boolean;
  label: string;
  caption?: string;
  onPress: () => void;
  compact?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={({ pressed }: any) => [
        styles.navPill,
        {
          minHeight: compact ? 52 : 60,
          backgroundColor: active ? theme.colors.primarySoft : theme.colors.surface,
          borderColor: active ? theme.colors.primary : theme.colors.border,
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
          shadowColor: theme.colors.shadow,
        },
        false && {
          borderColor: active ? theme.colors.primary : theme.colors.borderStrong,
        },
      ]}
    >
      <View style={styles.navCopy}>
        <Text style={[styles.navLabel, { color: theme.colors.text, fontFamily: theme.typography.family }]}>
          {label}
        </Text>
        {!compact && caption ? (
          <Text style={[styles.navCaption, { color: theme.colors.textSecondary, fontFamily: theme.typography.family }]}>
            {caption}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  tone = 'primary',
  compact = false,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'ghost';
  compact?: boolean;
}) {
  const theme = useAppTheme();
  const palette =
    tone === 'primary'
      ? {
          backgroundColor: theme.colors.primary,
          borderColor: theme.colors.primary,
          text: theme.colors.text,
        }
      : tone === 'secondary'
        ? {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.borderStrong,
            text: theme.colors.text,
          }
        : {
            backgroundColor: 'transparent',
            borderColor: theme.colors.border,
            text: theme.colors.textSecondary,
          };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }: any) => [
        styles.primaryButton,
        {
          minHeight: compact ? 44 : theme.layout.controlMinHeight,
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          shadowColor: theme.colors.shadow,
          opacity: pressed ? 0.94 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
        false && {
          borderColor: theme.colors.primary,
        },
      ]}
    >
      <Text
        style={[
          styles.primaryButtonText,
          { color: palette.text, fontFamily: theme.typography.family },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  placeholder,
  onChangeText,
  secureTextEntry,
  keyboardType,
  multiline = false,
}: {
  label: string;
  value?: string;
  placeholder?: string;
  onChangeText?: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  multiline?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: theme.colors.text, fontFamily: theme.typography.family }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[
          styles.fieldInput,
          {
            minHeight: multiline ? 108 : theme.layout.controlMinHeight,
            color: theme.colors.text,
            backgroundColor: theme.colors.background,
            borderColor: theme.colors.border,
            fontFamily: theme.typography.family,
          },
        ]}
      />
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
}: {
  value?: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
}) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.searchField,
        {
          backgroundColor: theme.colors.background,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.searchGlyph, { color: theme.colors.textSecondary }]}>⌕</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textTertiary}
        style={[
          styles.searchInput,
          { color: theme.colors.text, fontFamily: theme.typography.family },
        ]}
      />
    </View>
  );
}

export function MetricTile({
  label,
  value,
  helper,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'info';
}) {
  const theme = useAppTheme();
  const accent =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'info'
          ? theme.colors.info
          : theme.colors.primary;

  return (
    <View
      style={[
        styles.metricTile,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <View style={[styles.metricAccent, { backgroundColor: accent }]} />
      <Text style={[styles.metricLabel, { color: theme.colors.textSecondary, fontFamily: theme.typography.family }]}>
        {label}
      </Text>
      <Text style={[styles.metricValue, { color: theme.colors.text, fontFamily: theme.typography.family }]}>
        {value}
      </Text>
      {helper ? (
        <Text style={[styles.metricHelper, { color: theme.colors.textSecondary, fontFamily: theme.typography.family }]}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

export function ProgressBar({
  value,
  tone = 'primary',
  label,
}: {
  value: number;
  tone?: 'primary' | 'success' | 'warning' | 'error';
  label?: string;
}) {
  const theme = useAppTheme();
  const accent =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'error'
          ? theme.colors.error
          : theme.colors.primary;

  return (
    <View style={styles.progressGroup}>
      {label ? <Text style={[styles.progressLabel, { color: theme.colors.textSecondary, fontFamily: theme.typography.family }]}>{label}</Text> : null}
      <View
        style={[
          styles.progressTrack,
          { backgroundColor: theme.colors.surfaceStrong, borderColor: theme.colors.border },
        ]}
      >
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.max(8, Math.min(100, value))}%`,
              backgroundColor: accent,
            },
          ]}
        />
      </View>
    </View>
  );
}

export function SkeletonBlock({
  width = '100%',
  height = 16,
  radius = 14,
}: {
  width?: number | string;
  height?: number;
  radius?: number;
}) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.skeleton,
        {
          width: width as DimensionValue,
          height,
          borderRadius: radius,
          backgroundColor: theme.colors.surfaceStrong,
        },
      ]}
    />
  );
}

export function EmptyStatePanel({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.emptyState,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      <View
        style={[
          styles.emptyIcon,
          {
            backgroundColor: theme.colors.primarySoft,
            borderColor: theme.colors.primary,
          },
        ]}
      />
      <Text style={[styles.emptyTitle, { color: theme.colors.text, fontFamily: theme.typography.family }]}>
        {title}
      </Text>
      <Text style={[styles.emptyDescription, { color: theme.colors.textSecondary, fontFamily: theme.typography.family }]}>
        {description}
      </Text>
      {actionLabel && onAction ? (
        <PrimaryButton label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

export function StatePanel({
  state,
  title,
  description,
  actionLabel,
  onAction,
}: {
  state:
    | 'empty'
    | 'loading'
    | 'skeleton'
    | 'success'
    | 'error'
    | 'warning'
    | 'offline'
    | 'no-data'
    | 'permission-denied'
    | 'session-expired'
    | 'authentication-failed';
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useAppTheme();
  const tone =
    state === 'success'
      ? 'success'
      : state === 'warning'
        ? 'warning'
        : state === 'error' || state === 'authentication-failed' || state === 'permission-denied' || state === 'session-expired'
          ? 'error'
          : state === 'offline'
            ? 'info'
            : 'neutral';

  return (
    <SectionCard title={title} description={description} eyebrow={state.replace('-', ' ')}>
      <View style={styles.stateWrap}>
        <StatusChip tone={tone} label={title} description={description} />
        {state === 'loading' || state === 'skeleton' ? (
          <View style={styles.skeletonStack}>
            <SkeletonBlock height={18} />
            <SkeletonBlock width="86%" height={14} />
            <SkeletonBlock width="60%" height={14} />
          </View>
        ) : (
          <View
            style={[
              styles.stateGlyph,
              {
                backgroundColor:
                  tone === 'success'
                    ? 'rgba(34, 197, 94, 0.12)'
                    : tone === 'warning'
                      ? 'rgba(245, 158, 11, 0.12)'
                      : tone === 'error'
                        ? 'rgba(239, 68, 68, 0.12)'
                        : 'rgba(37, 99, 235, 0.12)',
                borderColor:
                  tone === 'success'
                    ? theme.colors.success
                    : tone === 'warning'
                      ? theme.colors.warning
                      : tone === 'error'
                        ? theme.colors.error
                        : theme.colors.info,
              },
            ]}
          >
            <Text style={[styles.stateGlyphText, { color: theme.colors.text, fontFamily: theme.typography.family }]}>
              {state === 'success' ? '✓' : state === 'error' ? '!' : state === 'warning' ? '•' : '◌'}
            </Text>
          </View>
        )}
        {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} /> : null}
      </View>
    </SectionCard>
  );
}

export function TimelineCard({
  title,
  description,
  tone = 'neutral',
  timestamp,
}: {
  title: string;
  description: string;
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
  timestamp?: string;
}) {
  const theme = useAppTheme();
  const accent =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'error'
          ? theme.colors.error
          : tone === 'info'
            ? theme.colors.info
            : theme.colors.primary;
  return (
    <View
      style={[
        styles.timelineCard,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      <View style={[styles.timelineDot, { backgroundColor: accent }]} />
      <View style={styles.timelineCopy}>
        <Text style={[styles.timelineTitle, { color: theme.colors.text, fontFamily: theme.typography.family }]}>
          {title}
        </Text>
        <Text style={[styles.timelineDescription, { color: theme.colors.textSecondary, fontFamily: theme.typography.family }]}>
          {description}
        </Text>
      </View>
      {timestamp ? (
        <Text style={[styles.timelineTimestamp, { color: theme.colors.textTertiary, fontFamily: theme.typography.family }]}>
          {timestamp}
        </Text>
      ) : null}
    </View>
  );
}

export function TableFrame({
  columns,
  children,
  footer,
}: {
  columns: string[];
  children: ReactNode;
  footer?: ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.tableFrame,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      <View
        style={[
          styles.tableHeader,
          { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.surface },
        ]}
      >
        {columns.map((column) => (
          <Text
            key={column}
            style={[
              styles.tableColumn,
              { color: theme.colors.textSecondary, fontFamily: theme.typography.family },
            ]}
          >
            {column}
          </Text>
        ))}
      </View>
      {children}
      {footer ? <View style={styles.tableFooter}>{footer}</View> : null}
    </View>
  );
}

export function TableRow({
  cells,
  tone = 'neutral',
}: {
  cells: ReactNode[];
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
}) {
  const theme = useAppTheme();
  const accent =
    tone === 'success'
      ? theme.colors.success
      : tone === 'warning'
        ? theme.colors.warning
        : tone === 'error'
          ? theme.colors.error
          : tone === 'info'
            ? theme.colors.info
            : theme.colors.primary;

  return (
    <View
      style={[
        styles.tableRow,
        { borderBottomColor: theme.colors.border, backgroundColor: theme.colors.background },
      ]}
    >
      <View style={[styles.tableAccent, { backgroundColor: accent }]} />
      {cells.map((cell, index) => (
        <View key={index} style={styles.tableCell}>
          {cell}
        </View>
      ))}
    </View>
  );
}

export function ToggleRow({
  title,
  description,
  value,
  onValueChange,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      style={[
        styles.toggleRow,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      <View style={styles.toggleCopy}>
        <Text style={[styles.toggleTitle, { color: theme.colors.text, fontFamily: theme.typography.family }]}>
          {title}
        </Text>
        <Text style={[styles.toggleDescription, { color: theme.colors.textSecondary, fontFamily: theme.typography.family }]}>
          {description}
        </Text>
      </View>
      <View
        style={[
          styles.switchTrack,
          { backgroundColor: value ? theme.colors.primary : theme.colors.surfaceStrong },
        ]}
      >
        <View
          style={[
            styles.switchThumb,
            {
              backgroundColor: theme.colors.background,
              transform: [{ translateX: value ? 20 : 0 }],
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

export function PermissionPrompt({
  title,
  description,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.permissionPrompt,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <Text style={[styles.permissionTitle, { color: theme.colors.text, fontFamily: theme.typography.family }]}>
        {title}
      </Text>
      <Text style={[styles.permissionDescription, { color: theme.colors.textSecondary, fontFamily: theme.typography.family }]}>
        {description}
      </Text>
      <View style={styles.permissionActions}>
        <PrimaryButton label={primaryLabel} onPress={onPrimary} />
        {secondaryLabel && onSecondary ? (
          <PrimaryButton label={secondaryLabel} onPress={onSecondary} tone="ghost" />
        ) : null}
      </View>
    </View>
  );
}

export function ScanViewport({
  status,
  hint,
  confidenceLabel,
  progress,
}: {
  status: string;
  hint: string;
  confidenceLabel: string;
  progress: number;
}) {
  const theme = useAppTheme();
  const scan = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(scan, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(scan, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [scan]);

  const translateY = scan.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 220],
  });

  return (
    <View
      style={[
        styles.scanViewport,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      <View style={styles.scanOverlayTop}>
        <StatusChip tone="info" label={status} description={hint} />
        <StatusChip tone="success" label={confidenceLabel} description="Confidence visualization" />
      </View>

      <View style={[styles.scanFrame, { borderColor: theme.colors.primarySoft }]}>
        <View style={styles.scanCorners} />
        <Animated.View
          style={[
            styles.scanLine,
            {
              backgroundColor: theme.colors.primary,
              transform: [{ translateY }],
            },
          ]}
        />
        <View style={styles.scanFaceMask}>
          <View
            style={[
              styles.scanFaceRing,
              {
                borderColor: theme.colors.primary,
                shadowColor: theme.colors.primary,
              },
            ]}
          />
        </View>
      </View>

      <View style={styles.scanFooter}>
        <ProgressBar value={progress} label="Verification progress" />
        <Text style={[styles.scanHint, { color: theme.colors.textSecondary, fontFamily: theme.typography.family }]}>
          {hint}
        </Text>
      </View>
    </View>
  );
}

export function ChartPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        styles.chartPanel,
        {
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <View style={styles.chartHeader}>
        <View>
          <Text style={[styles.chartTitle, { color: theme.colors.text, fontFamily: theme.typography.family }]}>
            {title}
          </Text>
          <Text style={[styles.chartDescription, { color: theme.colors.textSecondary, fontFamily: theme.typography.family }]}>
            {description}
          </Text>
        </View>
      </View>
      <View style={styles.chartBody}>{children}</View>
    </View>
  );
}

export function MiniChart() {
  const theme = useAppTheme();
  return (
    <View style={styles.miniChart}>
      <View style={[styles.gridLine, { top: 40, backgroundColor: theme.colors.border }]} />
      <View style={[styles.gridLine, { top: 88, backgroundColor: theme.colors.border }]} />
      <View style={[styles.gridLine, { top: 136, backgroundColor: theme.colors.border }]} />
      <View style={styles.chartBars}>
        {[34, 62, 44, 78, 56, 84].map((height, index) => (
          <View
            key={index}
            style={[
              styles.chartBar,
              {
                height,
                backgroundColor: index % 2 === 0 ? theme.colors.primary : theme.colors.secondary,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function AppFieldStack({
  children,
}: {
  children: ReactNode;
}) {
  return <View style={styles.fieldStack}>{children}</View>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
    flexDirection: 'row',
  },
  contentPane: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 12,
  },
  rail: {
    borderRightWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    gap: 18,
  },
  railNav: {
    gap: 10,
  },
  railStatus: {
    gap: 10,
  },
  mobileHeader: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 12,
    marginBottom: 16,
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  mobileNav: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  hero: {
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    marginBottom: 18,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  heroCopy: {
    flex: 1,
    gap: 10,
  },
  heroActions: {
    alignItems: 'flex-end',
    gap: 10,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: -0.55,
  },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 800,
  },
  content: {
    width: '100%',
    alignSelf: 'center',
    gap: 18,
    paddingBottom: 8,
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  brandMark: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  brandInner: {
    width: 18,
    height: 18,
    borderRadius: 7,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  brandCopy: {
    gap: 2,
    flexShrink: 1,
  },
  brandTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  brandSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    maxWidth: 260,
  },
  statusChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 5,
  },
  statusTextBlock: {
    flex: 1,
    gap: 2,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusDescription: {
    fontSize: 12,
    lineHeight: 16,
  },
  navPill: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    shadowOpacity: 0.03,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  navCopy: {
    flex: 1,
    gap: 2,
  },
  navLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  navCaption: {
    fontSize: 12,
    lineHeight: 16,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  sectionCopy: {
    flex: 1,
    gap: 6,
  },
  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 21,
  },
  sectionActions: {
    alignItems: 'flex-end',
  },
  sectionBody: {
    gap: 14,
  },
  sectionFooter: {
    paddingTop: 8,
  },
  primaryButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    minWidth: 120,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 48,
  },
  searchField: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchGlyph: {
    fontSize: 18,
    fontWeight: '700',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 12,
  },
  metricTile: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 8,
    minHeight: 124,
    flex: 1,
  },
  metricAccent: {
    width: 44,
    height: 6,
    borderRadius: 999,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  metricHelper: {
    fontSize: 12,
    lineHeight: 17,
  },
  progressGroup: {
    gap: 8,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  progressTrack: {
    height: 10,
    borderWidth: 1,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  skeleton: {
    overflow: 'hidden',
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    gap: 12,
    alignItems: 'flex-start',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  emptyDescription: {
    fontSize: 14,
    lineHeight: 21,
    maxWidth: 560,
  },
  stateWrap: {
    gap: 16,
  },
  stateGlyph: {
    width: 68,
    height: 68,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateGlyphText: {
    fontSize: 24,
    fontWeight: '800',
  },
  skeletonStack: {
    gap: 10,
    paddingVertical: 6,
  },
  timelineCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    marginTop: 5,
  },
  timelineCopy: {
    flex: 1,
    gap: 4,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  timelineDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  timelineTimestamp: {
    fontSize: 12,
    fontWeight: '600',
  },
  tableFrame: {
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  tableHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 12,
  },
  tableColumn: {
    flex: 1,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontWeight: '700',
  },
  tableRow: {
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  tableAccent: {
    width: 6,
    alignSelf: 'stretch',
    borderRadius: 999,
  },
  tableCell: {
    flex: 1,
  },
  tableFooter: {
    padding: 16,
  },
  toggleRow: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  toggleCopy: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  toggleDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  switchTrack: {
    width: 54,
    height: 30,
    borderRadius: 999,
    padding: 3,
    justifyContent: 'center',
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 999,
  },
  permissionPrompt: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 20,
    gap: 12,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  permissionDescription: {
    fontSize: 14,
    lineHeight: 21,
  },
  permissionActions: {
    gap: 12,
  },
  scanViewport: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    gap: 18,
  },
  scanOverlayTop: {
    gap: 12,
  },
  scanFrame: {
    minHeight: 320,
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanCorners: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  scanLine: {
    position: 'absolute',
    left: 22,
    right: 22,
    height: 3,
    borderRadius: 999,
    opacity: 0.8,
  },
  scanFaceMask: {
    width: '72%',
    aspectRatio: 0.82,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 197, 66, 0.05)',
  },
  scanFaceRing: {
    width: '76%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    borderStyle: 'dashed',
    opacity: 0.75,
    shadowOpacity: 0.1,
    shadowRadius: 18,
  },
  scanFooter: {
    gap: 10,
  },
  scanHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  chartPanel: {
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
    gap: 16,
  },
  chartHeader: {
    gap: 6,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  chartDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  chartBody: {
    gap: 16,
  },
  miniChart: {
    height: 220,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.02)',
    padding: 18,
    justifyContent: 'flex-end',
  },
  gridLine: {
    position: 'absolute',
    left: 18,
    right: 18,
    height: 1,
    opacity: 0.6,
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    height: '100%',
  },
  chartBar: {
    width: 18,
    borderRadius: 999,
  },
  fieldStack: {
    gap: 14,
  },
  orb: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 999,
  },
  orbSoft: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 999,
  },
});
