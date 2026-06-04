import React, { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { useSelector } from 'react-redux';

import {
  AppFrame,
  EmptyStatePanel,
  PrimaryButton,
  SectionCard,
  StatusChip,
  ToggleRow,
} from '../design-system/ui';
import { appSessionService } from '../services/AppSessionService';
import { useAppDispatch } from '../store/hooks';
import { RootState } from '../store';
import { logout } from '../store/slices/authSlices';

export default function SettingsScreen() {
  const dispatch = useAppDispatch();
  const currentUser = useSelector((state: RootState) => state.auth.currentUser);
  const activeSessionId = useSelector((state: RootState) => state.auth.activeSessionId);
  const isAdmin = currentUser?.role === 'admin';
  const [biometricLock, setBiometricLock] = useState(true);
  const [offlineMode, setOfflineMode] = useState(true);
  const [quietMode, setQuietMode] = useState(false);

  const signOut = async () => {
    await appSessionService.signOut(activeSessionId);
    dispatch(logout());
    router.replace('/enrollment');
  };

  return (
    <AppFrame
      screenKey="admin"
      eyebrow="Settings"
      title="Keep the workspace secure and simple"
      subtitle="A minimal settings surface for session controls, biometric rules, and offline behavior."
      actions={<StatusChip tone={isAdmin ? 'success' : 'warning'} label={isAdmin ? 'Admin access' : 'Limited access'} description={isAdmin ? 'You can change workspace rules' : 'Profile-level controls only'} />}
    >
      <View style={{ gap: 16 }}>
        <SectionCard
          eyebrow="Profile"
          title="Current account"
          description="Your profile summary stays short and easy to scan on mobile."
        >
          <View style={{ gap: 10 }}>
            <StatusChip tone="neutral" label={currentUser?.full_name ?? 'Guest user'} description={currentUser?.department ?? 'No department assigned'} />
            <StatusChip tone="neutral" label={currentUser?.role ?? 'visitor'} description="Access level" />
          </View>
        </SectionCard>

        <SectionCard
          eyebrow="Security"
          title="Session and biometric rules"
          description="Keep only the controls that matter for a fast mobile workflow."
        >
          <View style={{ gap: 12 }}>
            <ToggleRow
              title="Require face verification"
              description="Ask for liveness again before sensitive actions."
              value={biometricLock}
              onValueChange={setBiometricLock}
            />
            <ToggleRow
              title="Keep local offline mode"
              description="Allow cached templates and local session recovery."
              value={offlineMode}
              onValueChange={setOfflineMode}
            />
            <ToggleRow
              title="Quiet notifications"
              description="Reduce non-critical alerts and visual noise."
              value={quietMode}
              onValueChange={setQuietMode}
            />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
            <PrimaryButton label="Save settings" onPress={() => undefined} />
            <PrimaryButton label="Sign out" onPress={signOut} tone="secondary" />
          </View>
        </SectionCard>

        <SectionCard
          eyebrow="Recovery"
          title="If something goes wrong"
          description="A minimal app still needs a clear escape hatch."
        >
          <EmptyStatePanel
            title="Need help?"
            description="You can always return to the dashboard, redo liveness verification, or start registration again."
            actionLabel="Back to dashboard"
            onAction={() => router.replace('/home')}
          />
        </SectionCard>
      </View>
    </AppFrame>
  );
}
