# Cursor Task: Standardize Appointment Statuses to 3 Outcomes

## Validation Results

| # | File | Status | Summary |
|---|------|--------|---------|
| 1 | `lib/types.ts` line 68 | ✅ ALREADY DONE | All 4 DB values present — skip |
| 2 | `lib/validation.ts` lines 69, 151 | ✅ ALREADY DONE | Both enums have all 4 values — skip |
| 3 | `app/calendar/components/modals/AppointmentPreviewModal.tsx` | ❌ NEEDS WORK | STATUS_OPTIONS has 4 items + 'Completat' label + wrong active check + old CSS class names |
| 4 | `app/calendar/components/DayPanel/DayPanel.tsx` | ❌ NEEDS WORK | STATUS_CONFIG uses 'Completat' + old pill CSS class names + old 2-button quick actions block |
| 5 | `app/calendar/components/DayPanel/DayPanel.module.css` | ❌ NEEDS WORK | Has old classes (qBtn, qComplete, qAbsent, statusPillCompleted, statusPillCancelled, statusPillNoShow); new classes missing |
| 6 | `app/calendar/page.module.css` | ❌ NEEDS WORK | Uses old .scheduled/.completed/.cancelled/.no_show names; no statusFinalizat/statusAnulat/statusAbsent; statusSegmentButtonActive is one generic color |
| 7 | `app/calendar/components/WeekView/AppointmentBlock.tsx` | ❌ NEEDS WORK | Says 'Completat'; uses old CSS class mapping (no_show, cancelled etc.) |
| 8 | `app/calendar/components/modals/CreateAppointmentModal.tsx` | ❌ NEEDS WORK | STATUS_OPTIONS has 4 items + 'Completat' label; used in both select and segment buttons |
| 9 | `app/clients/[id]/ClientProfileClient.tsx` | ⚠️ PARTIALLY DONE | formatAppointmentStatus already returns 'Finalizat' (correct); getAppointmentStatusClass still uses old CSS names |
| 10 | `app/clients/[id]/page.module.css` | ❌ NEEDS WORK | Has old names (statusCompleted, statusCancelled, statusNoShow); new names missing |
| 11 | `lib/server/dashboard.ts` lines 295–303 | ✅ ALREADY DONE | Handles both no_show and no-show — skip |

---

## Goal

Reduce all user-facing appointment status labels and colors to exactly **3 outcome statuses**,
consistent across every component, modal, panel, and API in the app.

## Status Mapping

| DB value | Label | Color | Meaning |
|----------|-------|-------|---------|
| `scheduled` | *(no badge / neutral)* | gray / no highlight | Default state — appointment exists, no outcome yet. NOT a selectable outcome. |
| `completed` | **Finalizat** | `#16a34a` (green-600) | Patient came, treatment done |
| `cancelled` | **Anulat** | `#d97706` (amber-600) | Appointment cancelled |
| `no-show` | **Absent** | `#dc2626` (red-600) | Patient didn't show up |

`scheduled` stays in the DB as the initial state. It does NOT appear as a button option in
the status selector — it is only used to determine "no outcome recorded yet".
If needed for display (e.g. status pill on a card), show it as neutral gray text "Programat" without a colored badge.

---

## Files to change — complete list

### 1. `lib/types.ts` — line 68 ✅ ALREADY DONE

Current code already does this — skip.

```ts
status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
```

No change needed. All 4 values are already present.

---

### 2. `lib/validation.ts` — lines 69 and 151 ✅ ALREADY DONE

Current code already does this — skip.

Line 69: `status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']).optional(),`
Line 151: `status: z.enum(['scheduled', 'completed', 'cancelled', 'no-show']).optional(),`

Both enums already contain all 4 values.

---

### 3. `app/calendar/components/modals/AppointmentPreviewModal.tsx` ❌ NEEDS WORK

#### Change 3a: Replace STATUS_OPTIONS (4 items → 3 items, 'Completat' → 'Finalizat')

**Current code (lines 9–14):**
```ts
const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Programat' },
  { value: 'completed', label: 'Completat' },
  { value: 'cancelled', label: 'Anulat' },
  { value: 'no-show', label: 'Absent' },
] as const;
```

**Replace with:**
```ts
const STATUS_OPTIONS = [
  { value: 'completed', label: 'Finalizat' },
  { value: 'cancelled', label: 'Anulat' },
  { value: 'no-show', label: 'Absent' },
] as const;
```

#### Change 3b: Update statusLabel computation ('Completat' → 'Finalizat')

**Current code (lines 35–44):**
```tsx
const statusLabel =
  appointment?.status === 'scheduled'
    ? 'Programat'
    : appointment?.status === 'completed'
      ? 'Completat'
      : appointment?.status === 'cancelled'
        ? 'Anulat'
        : appointment?.status === 'no-show' || appointment?.status === 'no_show'
          ? 'Absent'
          : appointment?.status;
```

**Replace with:**
```tsx
const statusLabel =
  appointment?.status === 'completed' ? 'Finalizat' :
  appointment?.status === 'cancelled' ? 'Anulat' :
  (appointment?.status === 'no-show' || appointment?.status === 'no_show') ? 'Absent' :
  'Programat';
```

#### Change 3c: Update active button check — when status is 'scheduled' no button is active

**Current code (line 122):**
```tsx
className={`${styles.statusSegmentButton} ${appointment.status === statusOption.value ? styles.statusSegmentButtonActive : ''}`}
```

**Replace with:**
```tsx
className={`${styles.statusSegmentButton} ${
  appointment.status !== 'scheduled' && appointment.status === statusOption.value
    ? styles.statusSegmentButtonActive
    : ''
}`}
```

#### Change 3d: Add data-status attribute to each button (needed for CSS color variants in page.module.css)

**Current code (lines 118–127):**
```tsx
{STATUS_OPTIONS.map((statusOption) => (
  <button
    key={statusOption.value}
    type="button"
    className={`${styles.statusSegmentButton} ${appointment.status === statusOption.value ? styles.statusSegmentButtonActive : ''}`}
    onClick={() => onQuickStatusChange(statusOption.value)}
  >
    {statusOption.label}
  </button>
))}
```

**Replace with:**
```tsx
{STATUS_OPTIONS.map((statusOption) => (
  <button
    key={statusOption.value}
    type="button"
    data-status={statusOption.value}
    className={`${styles.statusSegmentButton} ${
      appointment.status !== 'scheduled' && appointment.status === statusOption.value
        ? styles.statusSegmentButtonActive
        : ''
    }`}
    onClick={() => onQuickStatusChange(statusOption.value)}
  >
    {statusOption.label}
  </button>
))}
```

#### Change 3e: Update status badge CSS class — use new class names instead of old dynamic ones

**Current code (line 102):**
```tsx
<span className={`${styles.previewStatusBadge} ${styles[normalizedStatus || 'scheduled']}`}>
```

The `normalizedStatus` variable maps to old CSS class names (`scheduled`, `completed`, `cancelled`, `no_show`) that use wrong colors in `page.module.css`.

**Replace with:**
```tsx
<span className={`${styles.previewStatusBadge} ${
  appointment?.status === 'completed' ? styles.statusFinalizat :
  appointment?.status === 'cancelled' ? styles.statusAnulat :
  (appointment?.status === 'no-show' || appointment?.status === 'no_show') ? styles.statusAbsent :
  styles.statusScheduled
}`}>
```

---

### 4. `app/calendar/components/DayPanel/DayPanel.tsx` ❌ NEEDS WORK

#### Change 4a: Update STATUS_CONFIG labels and CSS class names

**Current code (lines 27–32):**
```ts
const STATUS_CONFIG: Record<PanelStatusKey, { label: string; pillClass: string }> = {
  scheduled: { label: 'Programat',  pillClass: 'statusPillScheduled' },
  completed: { label: 'Completat',  pillClass: 'statusPillCompleted' },
  cancelled: { label: 'Anul.',      pillClass: 'statusPillCancelled' },
  'no-show': { label: 'Absent',     pillClass: 'statusPillNoShow' },
};
```

**Replace with:**
```ts
const STATUS_CONFIG: Record<PanelStatusKey, { label: string; pillClass: string }> = {
  scheduled: { label: 'Programat',  pillClass: 'statusPillScheduled' },
  completed: { label: 'Finalizat',  pillClass: 'statusPillFinalizat' },
  cancelled: { label: 'Anulat',     pillClass: 'statusPillAnulat' },
  'no-show': { label: 'Absent',     pillClass: 'statusPillAbsent' },
};
```

#### Change 4b: Replace 2-button conditional quick actions with 3-button status selector (always visible)

**Current code (lines 82–97):**
```tsx
{status === 'scheduled' && (
  <div className={styles.quickActions} onClick={(e) => e.stopPropagation()}>
    <button
      className={`${styles.qBtn} ${styles.qComplete}`}
      onClick={() => onStatusChange(apt.id, 'completed')}
    >
      {'\u2713'} Completat
    </button>
    <button
      className={`${styles.qBtn} ${styles.qAbsent}`}
      onClick={() => onStatusChange(apt.id, 'no-show')}
    >
      {'\u26a0'} Absent
    </button>
  </div>
)}
```

**Replace with:**
```tsx
<div className={styles.statusSelector} onClick={(e) => e.stopPropagation()}>
  <button
    className={`${styles.statusBtn} ${styles.statusBtnFinalizat} ${status === 'completed' ? styles.statusBtnActive : ''}`}
    onClick={() => onStatusChange(apt.id, 'completed')}
    title="Marchează ca Finalizat"
  >
    Finalizat
  </button>
  <button
    className={`${styles.statusBtn} ${styles.statusBtnAnulat} ${status === 'cancelled' ? styles.statusBtnActive : ''}`}
    onClick={() => onStatusChange(apt.id, 'cancelled')}
    title="Marchează ca Anulat"
  >
    Anulat
  </button>
  <button
    className={`${styles.statusBtn} ${styles.statusBtnAbsent} ${status === 'no-show' ? styles.statusBtnActive : ''}`}
    onClick={() => onStatusChange(apt.id, 'no-show')}
    title="Marchează ca Absent"
  >
    Absent
  </button>
</div>
```

---

### 5. `app/calendar/components/DayPanel/DayPanel.module.css` ❌ NEEDS WORK

#### Change 5a: Remove old classes

**Remove these existing blocks entirely:**
```css
.statusPillCompleted {
  background: color-mix(in srgb, var(--color-success) 22%, transparent);
  color: color-mix(in srgb, var(--color-success) 74%, white);
  border-color: color-mix(in srgb, var(--color-success) 40%, transparent);
}

.statusPillCancelled {
  background: color-mix(in srgb, var(--color-danger) 22%, transparent);
  color: color-mix(in srgb, var(--color-danger) 74%, white);
  border-color: color-mix(in srgb, var(--color-danger) 40%, transparent);
}

.statusPillNoShow {
  background: color-mix(in srgb, var(--color-text-soft) 22%, transparent);
  color: color-mix(in srgb, var(--color-text-soft) 80%, white);
  border-color: color-mix(in srgb, var(--color-text-soft) 40%, transparent);
}

/* ── Quick actions ── */
.quickActions {
  display: flex;
  gap: 0.35rem;
  margin-top: 0.2rem;
}

.qBtn {
  flex: 1;
  font-size: 0.68rem;
  font-weight: 620;
  padding: 0.28rem 0.4rem;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: background 120ms ease, transform 120ms ease;
  border: 1px solid;
  min-height: unset;
}

.qComplete {
  background: color-mix(in srgb, var(--color-success) 16%, transparent);
  color: color-mix(in srgb, var(--color-success) 74%, white);
  border-color: color-mix(in srgb, var(--color-success) 34%, transparent);
}
.qComplete:hover {
  background: color-mix(in srgb, var(--color-success) 26%, transparent);
  transform: translateY(-1px);
}

.qAbsent {
  background: color-mix(in srgb, var(--color-text-soft) 16%, transparent);
  color: color-mix(in srgb, var(--color-text-soft) 82%, white);
  border-color: color-mix(in srgb, var(--color-text-soft) 34%, transparent);
}
.qAbsent:hover {
  background: color-mix(in srgb, var(--color-text-soft) 26%, transparent);
  transform: translateY(-1px);
}
```

#### Change 5b: Add new classes

**Add these new classes (replace the removed block above or append after `.statusPillScheduled`):**
```css
/* Status pills on card — new naming */
.statusPillFinalizat {
  background: #dcfce7;
  color: #15803d;
  border-color: #bbf7d0;
}

.statusPillAnulat {
  background: #fef3c7;
  color: #b45309;
  border-color: #fde68a;
}

.statusPillAbsent {
  background: #fee2e2;
  color: #b91c1c;
  border-color: #fecaca;
}

/* Inline status selector on each card */
.statusSelector {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.statusBtn {
  flex: 1;
  font-size: 0.7rem;
  padding: 3px 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  opacity: 0.5;
  font-weight: 500;
  transition: opacity 0.15s, border-color 0.15s;
  min-height: unset;
}

.statusBtn:hover { opacity: 0.8; }
.statusBtnActive { opacity: 1 !important; border-color: currentColor; }

.statusBtnFinalizat { background: #dcfce7; color: #15803d; }
.statusBtnAnulat    { background: #fef3c7; color: #b45309; }
.statusBtnAbsent    { background: #fee2e2; color: #b91c1c; }
```

---

### 6. `app/calendar/page.module.css` ❌ NEEDS WORK

#### Change 6a: Add new status badge classes (used by AppointmentPreviewModal and AppointmentBlock)

The file currently has these old classes used for the preview modal status badge:
```css
.previewStatusBadge.scheduled { ... }   /* wrong color — uses success green for scheduled */
.previewStatusBadge.completed { ... }   /* wrong color — uses muted/gray for completed */
.previewStatusBadge.cancelled { ... }   /* uses danger/red */
.previewStatusBadge.no_show   { ... }   /* uses danger mix */
```

And for AppointmentBlock:
```css
.statusBadge--scheduled { ... }
.statusBadge--completed { ... }
.statusBadge--cancelled { ... }
.statusBadge--no-show   { ... }
```

**Add these new classes** (add after the existing `.previewStatusBadge.no_show` block):
```css
/* New standardized status badge classes — used by PreviewModal and AppointmentBlock */
.statusFinalizat {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

.statusAnulat {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
}

.statusAbsent {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.statusScheduled {
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #e5e7eb;
}
```

#### Change 6b: Update statusSegmentButtonActive to be color-specific per status

**Current code (around line 1826):**
```css
.statusSegmentButtonActive {
  background: var(--gradient-accent);
  color: var(--color-accent-contrast);
  border-color: var(--color-border-strong);
}
```

**Replace with (one generic active style + data-status overrides):**
```css
.statusSegmentButtonActive {
  color: white;
  border-color: transparent;
}

.statusSegmentButton[data-status="completed"].statusSegmentButtonActive {
  background: #16a34a;
}

.statusSegmentButton[data-status="cancelled"].statusSegmentButtonActive {
  background: #d97706;
}

.statusSegmentButton[data-status="no-show"].statusSegmentButtonActive {
  background: #dc2626;
}
```

#### Change 6c: Update AppointmentBlock status CSS classes

The file currently has old block-level appointment status classes used by `AppointmentBlock.tsx`:
```css
.appointment.scheduled { ... }   /* line 705 */
.appointment.completed { ... }   /* line 710 */
.appointment.cancelled { ... }   /* line 716 */
.appointment.no_show   { ... }   /* line 723 */
```

And badge classes:
```css
.statusBadge--scheduled { ... }   /* line 783 */
.statusBadge--completed { ... }   /* line 789 */
.statusBadge--cancelled { ... }   /* line 795 */
.statusBadge--no-show   { ... }   /* line 801 */
```

These classes are referenced by the current `AppointmentBlock.tsx` code which still uses old names. After updating `AppointmentBlock.tsx` (see section 7), these old classes can be removed or kept as dead code. Coordinate with section 7 changes.

---

### 7. `app/calendar/components/WeekView/AppointmentBlock.tsx` ❌ NEEDS WORK

#### Change 7a: Update status label ('Completat' → 'Finalizat')

**Current code (line 83):**
```tsx
{badgeStatusClass === 'completed' && 'Completat'}
```

**Replace with:**
```tsx
{badgeStatusClass === 'completed' && 'Finalizat'}
```

#### Change 7b: Update CSS class mapping to use new class names

**Current code (lines 20–21):**
```tsx
const appointmentStatusClass = appointment.status === 'no-show' ? 'no_show' : appointment.status;
const badgeStatusClass = appointment.status === 'no_show' ? 'no-show' : appointment.status;
```

The `appointmentStatusClass` is used in line 60:
```tsx
className={`${styles.appointment} ${styles[appointmentStatusClass]} ${isPast ? styles.isPast : ''} ${isDragging ? styles.dragging : ''}`}
```

The `badgeStatusClass` is used in line 81:
```tsx
<span className={`${styles.statusBadge} ${styles[`statusBadge--${badgeStatusClass}`]}`}>
```

**Replace lines 20–21 with:**
```tsx
const appointmentStatusClass =
  appointment.status === 'completed' ? 'statusFinalizat' :
  appointment.status === 'cancelled' ? 'statusAnulat' :
  (appointment.status === 'no-show' || appointment.status === 'no_show') ? 'statusAbsent' :
  'statusScheduled';
const badgeStatusClass = appointment.status === 'no_show' ? 'no-show' : appointment.status;
```

**Update line 60 to use the new class directly (not via bracket notation since it's now a full class name):**
```tsx
className={`${styles.appointment} ${styles[appointmentStatusClass]} ${isPast ? styles.isPast : ''} ${isDragging ? styles.dragging : ''}`}
```

Note: This still works because `appointmentStatusClass` is now a string like `'statusFinalizat'` which matches the CSS class `.statusFinalizat` added in section 6a.

**Update line 81 to use the new badge class names:**
```tsx
<span className={`${styles.statusBadge} ${styles[appointmentStatusClass]}`}>
```

This reuses `appointmentStatusClass` for both the block color and the badge color, since they use the same color scheme.

---

### 8. `app/calendar/components/modals/CreateAppointmentModal.tsx` ❌ NEEDS WORK

#### Change 8a: Replace STATUS_OPTIONS (4 items → 3 items, 'Completat' → 'Finalizat')

**Current code (lines 106–111):**
```ts
const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Programat' },
  { value: 'completed', label: 'Completat' },
  { value: 'cancelled', label: 'Anulat' },
  { value: 'no-show', label: 'Absent' },
] as const;
```

**Replace with:**
```ts
const STATUS_OPTIONS = [
  { value: 'completed', label: 'Finalizat' },
  { value: 'cancelled', label: 'Anulat' },
  { value: 'no-show', label: 'Absent' },
] as const;
```

This affects:
1. The `getStatusLabel()` helper function (line 138–140) — will now return the correct labels
2. The `<select>` dropdown in edit mode (around line 998–1006) — will show 3 options
3. The `statusSegmentedControl` in the modal footer (around lines 1207–1224) — will show 3 buttons

Note: Removing `scheduled` from `STATUS_OPTIONS` means `getStatusLabel('scheduled')` will return the raw string `'scheduled'`. If the label "Programat" is needed anywhere via `getStatusLabel`, add a separate lookup or guard:
```ts
function getStatusLabel(status: string): string {
  if (status === 'scheduled') return 'Programat';
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || status;
}
```

#### Change 8b: Add data-status attribute to segment buttons in modal footer

**Current code (around lines 1211–1223):**
```tsx
{STATUS_OPTIONS.map((statusOption) => (
  <button
    key={statusOption.value}
    type="button"
    className={`${styles.statusSegmentButton} ${selectedStatus === statusOption.value ? styles.statusSegmentButtonActive : ''}`}
    onClick={async () => {
      if (selectedStatus === statusOption.value) return;
      await onStatusChange(statusOption.value);
    }}
  >
    {statusOption.label}
  </button>
))}
```

**Replace with:**
```tsx
{STATUS_OPTIONS.map((statusOption) => (
  <button
    key={statusOption.value}
    type="button"
    data-status={statusOption.value}
    className={`${styles.statusSegmentButton} ${selectedStatus === statusOption.value ? styles.statusSegmentButtonActive : ''}`}
    onClick={async () => {
      if (selectedStatus === statusOption.value) return;
      await onStatusChange(statusOption.value);
    }}
  >
    {statusOption.label}
  </button>
))}
```

---

### 9. `app/clients/[id]/ClientProfileClient.tsx` ⚠️ PARTIALLY DONE

#### Already done — formatAppointmentStatus (lines 247–255)

Current code already returns 'Finalizat' for completed — **no change needed here**:
```ts
const formatAppointmentStatus = (status: string): string => {
  const labels: Record<string, string> = {
    completed: 'Finalizat',   // CORRECT — already done
    scheduled: 'Programat',
    cancelled: 'Anulat',
    'no-show': 'Absent',
  };
  return labels[status] ?? status;
};
```

#### Needs work — getAppointmentStatusClass (lines 257–270)

**Current code:**
```ts
const getAppointmentStatusClass = (status: string) => {
  switch (status) {
    case 'completed':
      return styles.statusCompleted;
    case 'scheduled':
      return styles.statusScheduled;
    case 'cancelled':
      return styles.statusCancelled;
    case 'no-show':
      return styles.statusNoShow;
    default:
      return styles.statusDefault;
  }
};
```

**Replace with:**
```ts
const getAppointmentStatusClass = (status: string) => {
  switch (status) {
    case 'completed': return styles.statusFinalizat;
    case 'scheduled': return styles.statusScheduled;
    case 'cancelled': return styles.statusAnulat;
    case 'no-show':   return styles.statusAbsent;
    default:          return styles.statusDefault;
  }
};
```

---

### 10. `app/clients/[id]/page.module.css` ❌ NEEDS WORK

**Current code (lines 106–127):**
```css
.badgeActive,
.statusScheduled,
.badgeDefault {
  background: rgba(77, 163, 255, 0.11);
  color: #bddfff;
  border-color: rgba(77, 163, 255, 0.3);
}

.statusCompleted {
  background: rgba(52, 211, 153, 0.12);
  color: #a7f3d0;
  border-color: rgba(52, 211, 153, 0.3);
}

.badgeInactive,
.statusCancelled,
.statusNoShow,
.statusDefault {
  background: rgba(148, 163, 184, 0.12);
  color: var(--color-text-soft);
  border-color: var(--color-border);
}
```

**Replace with:**
```css
.badgeActive,
.statusScheduled,
.badgeDefault {
  background: rgba(77, 163, 255, 0.11);
  color: #bddfff;
  border-color: rgba(77, 163, 255, 0.3);
}

.statusFinalizat {
  background: rgba(52, 211, 153, 0.12);
  color: #a7f3d0;
  border-color: rgba(52, 211, 153, 0.3);
}

.statusAnulat {
  background: rgba(217, 119, 6, 0.12);
  color: #fcd34d;
  border-color: rgba(217, 119, 6, 0.3);
}

.statusAbsent {
  background: rgba(220, 38, 38, 0.12);
  color: #fca5a5;
  border-color: rgba(220, 38, 38, 0.3);
}

.badgeInactive,
.statusDefault {
  background: rgba(148, 163, 184, 0.12);
  color: var(--color-text-soft);
  border-color: var(--color-border);
}
```

---

### 11. `lib/server/dashboard.ts` — lines 295–303 ✅ ALREADY DONE

Current code already does this — skip.

```ts
const noShows = (appointmentsInRange as any[]).filter(
  (appointment: any) => appointment.status === 'no_show' || appointment.status === 'no-show'
).length;
const totalAppointments = (appointmentsInRange as any[]).filter((appointment: any) =>
  ['scheduled', 'completed', 'no_show', 'no-show', 'cancelled'].includes(appointment.status)
).length;
```

Both `no_show` and `no-show` are already handled. No change needed.

---

## Summary of label changes

| Old label | New label | Where |
|-----------|-----------|-------|
| "Completat" | **"Finalizat"** | All UI components |
| "Anulat" | **"Anulat"** | *(no change)* |
| "Absent" | **"Absent"** | *(no change)* |
| "Programat" | **"Programat"** | Kept for `scheduled` display only, not selectable |

## Summary of color changes

| Status | Old color (approx) | New color |
|--------|-------------------|-----------|
| `completed` / Finalizat | green | `#16a34a` green-600 |
| `cancelled` / Anulat | red | `#d97706` amber-600 (yellow) |
| `no-show` / Absent | orange | `#dc2626` red-600 |
| `scheduled` / Programat | blue/gray | `#6b7280` gray-500 (neutral) |

## Do NOT change

- DB values (`scheduled`, `completed`, `cancelled`, `no-show`) — keep as-is
- Zod validation enums in `lib/validation.ts` — keep all 4 values
- TypeScript type in `lib/types.ts` — keep all 4 values
- API logic that filters by status value — DB values unchanged
- `no-show` vs `no_show` normalization — keep existing handling
