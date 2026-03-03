# Calendar DayPanel UX Redesign

Files: `app/calendar/components/DayPanel/DayPanel.tsx` + `DayPanel.module.css`

---

## 1. Replace `<select>` view switcher with pill tabs

**Remove** the `<select className={styles.selectControl}>` for viewType (lines ~372-382).

**Replace with** pill tab buttons — use the same pattern as `app/clients/[id]/page.module.css` `.tabs` / `.tab` / `.tabActive`:

```tsx
<div className={styles.viewTabs}>
  {(['day','week','workweek','month'] as CalendarViewType[]).map((v) => (
    <button
      key={v}
      className={`${styles.viewTab}${viewType === v ? ` ${styles.viewTabActive}` : ''}`}
      onClick={() => onViewTypeChange(v)}
    >
      {{ day: 'Zi', week: 'Săptămână', workweek: 'Săpt. lucru', month: 'Lună' }[v]}
    </button>
  ))}
</div>
```

CSS for `.viewTabs`, `.viewTab`, `.viewTabActive` — copy the exact same styles as `.tabs`, `.tab`, `.tabActive` from `app/clients/[id]/page.module.css` (dark pill container, gradient active, nowrap).

Keep the provider/resource `<select>` dropdowns — those are functional filters, not navigation.

---

## 2. Merge the "ASTAZI / 3 martie" eyebrow+date into one line, move `+` button right

**Current** (lines ~510-527): two-line header — `<p>Astazi</p>` eyebrow + `<h3>3 martie</h3>` + floating `+` button.

**Replace** with a single row:

```tsx
<header className={styles.header}>
  <h3 className={styles.headerDate}>
    {isToday(selectedDay)
      ? `Astăzi, ${format(selectedDay, 'd MMMM', { locale: ro })}`
      : format(selectedDay, 'EEEE, d MMMM', { locale: ro })}
  </h3>
  <button className={styles.addBtn} onClick={onCreateClick} aria-label="Adaugă programare">
    + Adaugă
  </button>
</header>
```

Remove `.headerLeft`, `.headerEyebrow` classes — no longer needed.

Update `.addBtn` CSS: make it a small outlined button (`border: 1px solid var(--color-border); padding: 4px 12px; border-radius: var(--radius-md); font-size: 0.82rem`) instead of a bare `+` circle.

---

## 3. Replace the stats strip with statItemSecondary cards

**Current** (lines ~529-549): `.statsStrip` with 4 `.statItem` divs separated by `.statDivider` — looks like a skeleton row.

**Replace** with a 4-column grid of cards, matching the `statItemSecondary` pattern from `app/clients/[id]/page.module.css`:

```tsx
<div className={styles.statsGrid}>
  <div className={styles.statCard}>
    <span className={styles.statCardValue}>{stats.total}</span>
    <span className={styles.statCardLabel}>Total</span>
  </div>
  <div className={styles.statCard}>
    <span className={`${styles.statCardValue} ${styles.statScheduled}`}>{stats.scheduled}</span>
    <span className={styles.statCardLabel}>Programate</span>
  </div>
  <div className={styles.statCard}>
    <span className={`${styles.statCardValue} ${styles.statCompleted}`}>{stats.completed}</span>
    <span className={styles.statCardLabel}>Complete</span>
  </div>
  <div className={styles.statCard}>
    <span className={`${styles.statCardValue} ${styles.statOther}`}>{stats.other}</span>
    <span className={styles.statCardLabel}>Anulate</span>
  </div>
</div>
```

CSS for `.statsGrid`: `display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-2);`

CSS for `.statCard`: `background: rgba(9,16,34,0.35); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); text-align: center;`

CSS for `.statCardValue`: `display: block; font-size: 1.1rem; font-weight: 700; color: var(--color-text);`

CSS for `.statCardLabel`: `display: block; font-size: 0.68rem; color: var(--color-text-soft); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px;`

Keep color overrides: `.statScheduled { color: var(--color-accent); }` `.statCompleted { color: #34d399; }` `.statOther { color: #f87171; }`

---

## 4. Move search below the date header

**Current**: search is in `.controlRow` at the top, above the mini calendar — it's visually dominant but rarely used.

**Move** the search `<div className={styles.searchWrapper}>` to just below the `<header>` (date + add button), above the stats grid. Remove it from `.controlRow`. If `.controlRow` becomes empty after removing search, remove the wrapper too.

---

## 5. Remove empty-state duplicate CTA

**Current** (line ~556): `<button className={styles.emptyDayBtn}>+ Adauga programare</button>` in the empty day state.

**Remove** this button — the `+ Adaugă` button in the header (change 2 above) already covers this. Keep the icon and text, just remove the button.

---

## 6. Remove dead CSS

After the above changes, remove from `DayPanel.module.css`:
- `.statsStrip`, `.statDivider`, `.statNum`, `.statNumScheduled`, `.statNumCompleted`, `.statNumOther`, `.statLabel` (replaced by statCard classes)
- `.headerEyebrow`, `.headerLeft` (removed from header)
- `.selectControl`, `.selectGroup` if only the view select used them (keep if provider/resource selects still reference them)
- `.emptyDayBtn` (removed from empty state)

---

## Do NOT change
- Mini calendar component — it's correct and useful
- Week navigation arrows + "Astazi" button in the top control bar — keep as-is
- Provider/resource filter selects — keep as functional filters
- Appointment list items and appointment cards
- All modal components
