# Calendar UX Redesign — Cursor Instructions

## Goal
Move all navigation/view controls out of the sidebar (DayPanel) into a dedicated top header above the calendar grid. The sidebar becomes focused: mini calendar → selected day → appointment list.

---

## 1. CalendarPageClient.tsx — Add main header above the calendar grid

**File:** `app/calendar/CalendarPageClient.tsx`

Inside the `return`, wrap the current `<main>` content by adding a `<header>` block ABOVE `<div className={styles.calendarWithPanel}>`:

```tsx
<main className={styles.main}>

  {/* ── Main calendar header ── */}
  <header className={styles.calendarHeader}>
    <div className={styles.headerNav}>
      <button type="button" className={styles.navBtn} onClick={actions.prevPeriod} aria-label="Perioada anterioara">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <button type="button" className={styles.rangeBtn} onClick={() => { /* keep existing jump-to-date logic if needed */ }}>
        {rangeLabel}
      </button>
      <button type="button" className={styles.navBtn} onClick={actions.nextPeriod} aria-label="Perioada urmatoare">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
      <button type="button" className={styles.todayBtn} onClick={actions.goToToday}>Astăzi</button>
    </div>

    <div className={styles.viewTabs}>
      {(['day', 'week', 'workweek', 'month'] as const).map((v) => (
        <button
          key={v}
          type="button"
          className={`${styles.viewTab}${state.viewType === v ? ` ${styles.viewTabActive}` : ''}`}
          onClick={() => actions.setViewType(v)}
        >
          {{ day: 'Zi', week: 'Săptămână', workweek: 'Săpt. lucru', month: 'Lună' }[v]}
        </button>
      ))}
    </div>

    <div className={styles.headerFilters}>
      {providers.length > 0 && (
        <select
          className={styles.filterSelect}
          value={state.selectedProvider?.id || ''}
          onChange={(e) => actions.selectProvider(providers.find((p) => p.id === parseInt(e.target.value)) || null)}
          aria-label="Filtreaza dupa furnizor"
        >
          <option value="">Toți furnizorii</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {resources.length > 0 && (
        <select
          className={styles.filterSelect}
          value={state.selectedResource?.id || ''}
          onChange={(e) => actions.selectResource(resources.find((r) => r.id === parseInt(e.target.value)) || null)}
          aria-label="Filtreaza dupa resursa"
        >
          <option value="">Toate resursele</option>
          {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      )}
    </div>
  </header>

  {/* Calendar grid + sidebar */}
  <div className={styles.calendarWithPanel}>
    ...existing WeekView/MonthView...
    <DayPanel
      selectedDay={selectedDay}
      appointments={appointments}
      currentDate={state.currentDate}
      searchQuery={searchQuery}
      onAppointmentClick={...}
      onQuickStatusChange={handlePanelStatusChange}
      onCreateClick={() => handleSlotClick(selectedDay, 9)}
      onNavigate={(date) => { setSelectedDay(date); actions.navigateToDate(date); }}
      onSearchChange={setSearchQuery}
    />
  </div>
</main>
```

**Remove from the DayPanel JSX call:** `rangeLabel`, `viewType`, `providers`, `resources`, `selectedProviderId`, `selectedResourceId`, `onPrevPeriod`, `onNextPeriod`, `onTodayClick`, `onViewTypeChange`, `onProviderChange`, `onResourceChange`, `onJumpToDate`

---

## 2. DayPanel.tsx — Strip the controlSection entirely

**File:** `app/calendar/components/DayPanel/DayPanel.tsx`

### 2a. Update props interface — remove moved props
Remove from `DayPanelProps`:
- `rangeLabel`, `viewType`, `providers`, `resources`, `selectedProviderId`, `selectedResourceId`
- `onPrevPeriod`, `onNextPeriod`, `onTodayClick`, `onViewTypeChange`, `onProviderChange`, `onResourceChange`, `onJumpToDate`

Keep: `selectedDay`, `appointments`, `currentDate`, `searchQuery`, `onAppointmentClick`, `onQuickStatusChange`, `onCreateClick`, `onNavigate`, `onSearchChange`

### 2b. Remove the entire `controlSection` block
Delete this entire JSX block (the one wrapping `controlRow` with nav buttons, `viewTabs`, and `selectGroup`):
```tsx
{/* Controls */}
<div className={styles.controlSection}>
  ...everything inside...
</div>
```

### 2c. Fix broken icons

**Search icon** (appears twice — both instances):
```tsx
// BEFORE
<span className={styles.searchIcon}>?</span>
// AFTER
<svg className={styles.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
```

**Clear button** (appears twice — both instances):
```tsx
// BEFORE
<button ...>x</button>
// AFTER
<button ...>×</button>
```

**Empty state icon — `emptyEmoji` (two instances, `*` literal):**
```tsx
// BEFORE
<span className={styles.emptyEmoji}>*</span>
// AFTER
<svg className={styles.emptyEmoji} width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
```

**Empty day icon — `emptyDayEmoji` (two instances, `*` literal):**
Same SVG as above but smaller (width="28" height="28").

### 2d. Stats grid — hide when no appointments
```tsx
// BEFORE
<div className={styles.statsGrid}>
// AFTER
{stats.total > 0 && (
  <div className={styles.statsGrid}>
    ...
  </div>
)}
```

### 2e. Remove category tag from appointment cards
In `AppointmentCard`, delete:
```tsx
{apt.category && (
  <span className={styles.categoryTag} ...>
    {apt.category}
  </span>
)}
```
(Too noisy in a 300px panel. Category is visible via the colorBar.)

### 2f. Search — always visible, not inside selectedDay conditional
Move the `searchWrapper` block to be rendered immediately after `<MiniCalendar />`, before the `isSearching` / selectedDay conditional. Remove it from both the `isSearching` branch and the `selectedDay` branch. One instance, always visible.

---

## 3. page.module.css — Add header styles

**File:** `app/calendar/page.module.css`

Replace or add to the existing `.calendarHeader` section:

```css
.calendarHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.9rem;
  margin-bottom: 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: var(--shadow-sm);
  flex-wrap: wrap;
}

.headerNav {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.navBtn {
  width: 30px;
  height: 30px;
  min-height: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-muted);
  color: var(--color-text-soft);
  padding: 0;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.navBtn:hover {
  background: var(--color-surface-strong);
  color: var(--color-text);
  border-color: var(--color-border-strong);
}

.rangeBtn {
  height: 30px;
  min-height: unset;
  padding: 0 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-muted);
  color: var(--color-text);
  font-size: 0.82rem;
  font-weight: 620;
  letter-spacing: -0.01em;
  white-space: nowrap;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.rangeBtn:hover {
  background: color-mix(in srgb, var(--color-accent) 12%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-accent) 30%, var(--color-border));
}

.todayBtn {
  height: 30px;
  min-height: unset;
  padding: 0 0.75rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface-muted);
  color: var(--color-text);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.todayBtn:hover {
  background: var(--color-surface-strong);
  border-color: var(--color-border-strong);
}

/* View tabs — same pattern as clients page */
.viewTabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgba(9, 16, 34, 0.45);
}

.viewTab {
  padding: 0.38rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-soft);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  white-space: nowrap;
  transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
}
.viewTab:hover {
  color: var(--color-text);
  background: var(--color-surface-strong);
  border-color: var(--color-border-strong);
}
.viewTabActive {
  color: #d9ecff;
  background: linear-gradient(135deg, rgba(27, 99, 219, 0.22) 0%, rgba(77, 163, 255, 0.18) 100%);
  border-color: rgba(77, 163, 255, 0.38);
}

.headerFilters {
  display: flex;
  gap: 0.4rem;
  flex-shrink: 0;
}

.filterSelect {
  height: 30px;
  min-height: unset;
  padding: 0 0.6rem;
  background: var(--color-surface-muted);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: 0.76rem;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}
.filterSelect:hover {
  background: var(--color-surface-strong);
  border-color: var(--color-border-strong);
}
```

---

## 4. DayPanel.module.css — Remove dead classes

After changes above, remove these now-unused classes:
- `.controlSection`, `.controlRow`
- `.ctrlButton`, `.rangeLabelButton`, `.todayButton`, `.hiddenDateInput`
- `.viewTabs`, `.viewTab`, `.viewTabActive`, `.viewTabs::-webkit-scrollbar`
- `.selectGroup`, `.selectControl`
- `.categoryTag`
- `.emptyEmoji` — replace with inline SVG style: `opacity: 0.4; color: var(--color-text-soft);`
- `.emptyDayEmoji` — same

Keep all card, list, stats, search, mini-calendar, header, empty state classes.

---

## 5. Fix the `searchIcon` CSS — position SVG correctly

In `DayPanel.module.css`, change `.searchIcon`:
```css
.searchIcon {
  position: absolute;
  left: 0.52rem;
  display: flex;
  align-items: center;
  color: var(--color-text-soft);
  pointer-events: none;
  top: 50%;
  transform: translateY(-50%);
}
```

---

## Do NOT change
- `MiniCalendar` component logic or CSS
- `AppointmentCard` structure (except removing categoryTag)
- All modal components
- `WeekView`, `MonthView` components
- Appointment data fetching, state management, hooks
- Status pill styles, quick action buttons
- Search logic (filtering, grouping) — only move the input position
