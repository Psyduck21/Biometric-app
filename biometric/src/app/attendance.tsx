import React from 'react';
import { View } from 'react-native';

import {
  AppFrame,
  SectionCard,
  StatusChip,
  TableFrame,
  TableRow,
  TimelineCard,
} from '../design-system/ui';

export default function ActivityLogsScreen() {
  return (
    <AppFrame
      screenKey="logs"
      eyebrow="Activity"
      title="A light log view for recent actions"
      subtitle="The log screen stays compact so it feels useful on a phone without turning into a data wall."
      actions={<StatusChip tone="info" label="Recent events" description="Latest sign-ins and changes" />}
    >
      <View style={{ gap: 16 }}>
        <SectionCard
          eyebrow="Recent"
          title="Last few actions"
          description="Use this area for the most important identity events."
        >
          <View style={{ gap: 10 }}>
            <TimelineCard title="Face verification complete" description="The last liveness challenge was successful." tone="success" timestamp="Now" />
            <TimelineCard title="Settings updated" description="A biometric preference was changed." tone="info" timestamp="Earlier" />
            <TimelineCard title="Sync queue idle" description="No records are waiting to upload." tone="neutral" timestamp="Today" />
          </View>
        </SectionCard>

        <SectionCard
          eyebrow="Summary"
          title="Tiny table for status history"
          description="Keep the structure simple and readable, especially on mobile."
        >
          <TableFrame columns={['Action', 'State', 'When']}>
            <TableRow
              cells={[
                <StatusChip key="a" tone="neutral" label="Login" description="Liveness verification" />,
                <StatusChip key="b" tone="success" label="Success" description="Verified" />,
                <StatusChip key="c" tone="neutral" label="Now" description="Just now" />,
              ]}
            />
            <TableRow
              tone="info"
              cells={[
                <StatusChip key="d" tone="neutral" label="Settings" description="Session preference" />,
                <StatusChip key="e" tone="info" label="Updated" description="Saved locally" />,
                <StatusChip key="f" tone="neutral" label="Today" description="Earlier today" />,
              ]}
            />
          </TableFrame>
        </SectionCard>
      </View>
    </AppFrame>
  );
}
