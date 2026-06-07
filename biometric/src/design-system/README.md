# Design System Reference

## Visual Language
- Theme: white and yellow enterprise UI
- Core palette: `#F5C542`, `#FFD966`, `#FFFFFF`, `#FAFAFA`, `#222222`, `#666666`
- Status colors: `#22C55E`, `#F59E0B`, `#EF4444`
- Borders: `#E5E7EB`
- Shape: large rounded corners, soft shadows, spacious cards

## Token Groups
- `theme.colors`: background, surface, text, border, status colors, shadow
- `theme.spacing`: spacing scale from compact to spacious
- `theme.radius`: card, control, pill, and container radii
- `theme.typography`: display, heading, body, label, and mono ramps
- `theme.shadow`: card and elevated shadow presets
- `theme.layout`: rail width, max content width, touch target sizes
- `theme.motion`: fast, medium, and slow transition timings

## Reusable Components
- `AppFrame`: responsive workspace shell with desktop rail and mobile nav
- `SectionCard`: card surface for grouped content and settings
- `StatusChip`: semantic state indicator for trust, sync, and alerts
- `PrimaryButton`: primary, secondary, and ghost actions
- `TextField` and `SearchField`: form and filtering controls
- `MetricTile`: schema-driven metric presentation shell
- `ProgressBar`: confidence, progress, and completion visualizer
- `SkeletonBlock`: loading placeholder element
- `EmptyStatePanel`: empty, no-data, and fallback surface
- `StatePanel`: reusable state renderer for common system states
- `TimelineCard`: history and event feed entry
- `TableFrame` and `TableRow`: responsive table scaffolding
- `ToggleRow`: settings switch row
- `PermissionPrompt`: camera and permission recovery pattern
- `ScanViewport`: offline face-verification camera shell
- `ChartPanel` and `MiniChart`: analytics and chart scaffolding

## Interaction Rules
- Hover: increase contrast and border emphasis on web
- Focus: preserve visible ring-equivalent border states
- Press: subtle scale or translate feedback on touch
- Loading: show skeleton blocks or progress bars
- Success: use green confirmation and stable layout
- Warning: use amber callouts and clear recovery actions
- Error: use red status chips and retry affordances
- Offline: keep workflows available with clear cache/sync labels

## Screen Coverage
- `index`: authentication
- `scanner`: facial verification
- `home`: dashboard
- `attendance`: activity logs
- `enrollment`: profile and settings
- `states`: system state library
