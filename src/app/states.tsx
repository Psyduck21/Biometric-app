import React from 'react';
import { View, useWindowDimensions } from 'react-native';

import { AppFrame, StatePanel, SectionCard } from '../design-system/ui';

export default function SystemStatesScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 980;

  return (
    <AppFrame
      screenKey="states"
      eyebrow="System states"
      title="A complete catalog of interface states"
      subtitle="The design system remains consistent across loading, empty, success, error, offline, and authentication-related fallbacks."
    >
      <View style={{ gap: 18 }}>
        <SectionCard
          eyebrow="State architecture"
          title="Reusable state templates"
          description="Each state panel is designed to be dropped into any screen without rethinking spacing, typography, or recovery actions."
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <StatePanel
              state="empty"
              title="Empty state"
              description="No configured items are available yet."
              actionLabel="Add configuration"
              onAction={() => undefined}
            />
            <StatePanel
              state="loading"
              title="Loading state"
              description="Content is being resolved from the backend."
            />
            <StatePanel
              state="skeleton"
              title="Skeleton screen"
              description="Structure is visible before data loads."
            />
            <StatePanel
              state="success"
              title="Success state"
              description="Operation completed and verified."
            />
          </View>
        </SectionCard>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
          <View style={{ flexGrow: 1, flexBasis: isDesktop ? 480 : '100%', gap: 18 }}>
            <StatePanel
              state="error"
              title="Error state"
              description="Communication, validation, or processing failed."
              actionLabel="Retry"
              onAction={() => undefined}
            />
            <StatePanel
              state="warning"
              title="Warning state"
              description="The workflow needs attention or manual review."
            />
            <StatePanel
              state="offline"
              title="Offline state"
              description="The app continues with local-first capabilities."
            />
          </View>

          <View style={{ flexGrow: 1, flexBasis: isDesktop ? 480 : '100%', gap: 18 }}>
            <StatePanel
              state="no-data"
              title="No data state"
              description="The backend response contains no records for this view."
            />
            <StatePanel
              state="permission-denied"
              title="Permission denied state"
              description="Access to camera, network, or device hardware was blocked."
            />
            <StatePanel
              state="session-expired"
              title="Session expired state"
              description="The user must re-authenticate before continuing."
            />
            <StatePanel
              state="authentication-failed"
              title="Authentication failed state"
              description="Facial verification or credential validation did not succeed."
            />
          </View>
        </View>
      </View>
    </AppFrame>
  );
}
