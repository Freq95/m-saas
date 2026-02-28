# Clients Page — UX Simplification & Professional Polish

## Context

The client detail page (`/clients/[id]`) has accumulated redundancy and visual clutter:
- The "Activitate" tab has 4 sub-filters (Toate / Notite / Email-uri / Programari) that duplicate content already visible in the dedicated "Programari" and "Conversatii" tabs — confusing and noisy
- The back button is unstyled plain text ("Inapoi") with no icon — poor wayfinding
- Tabs use pill-button styling (bordered boxes) instead of the enterprise-standard underline pattern
- Activity/file icons use raw emoji (`??`, `??`) — unprofessional
- Appointment statuses display raw English strings (`completed`, `scheduled`) instead of Romanian labels
- "+ Nota" lives as a top-level header action with no obvious "home" in the UI

**Goal:** Simplify to 4 tabs, move notes into Overview, proper back breadcrumb, underline tabs, SVG icons, Romanian status labels.

---

## Files to Modify

| File | Change |
|------|--------|
| `app/clients/[id]/ClientProfileClient.tsx` | Remove Activitate tab, add Notes to Overview, breadcrumb, SVG icons, Romanian labels |
| `app/clients/[id]/page.module.css` | Underline tab styles, breadcrumb styles, notes section styles, remove dead classes |

**No new files. No API changes.**

---

## Step 1 — Remove "Activitate" tab entirely

**File:** `app/clients/[id]/ClientProfileClient.tsx`

Remove all of the following:
- `activityFilter` state + `setActivityFilter`
- `activities` state + `fetchActivities()` function
- The `useEffect` that re-fetches when `activityFilter` or `activeTab === 'activities'` changes
- All `fetchActivities()` call sites
- The Activitate `<button>` from the tab bar
- The `{activeTab === 'activities' && ...}` JSX block (the entire activities render section)
- `'activities'` from the `activeTab` TypeScript type union

**File:** `app/clients/[id]/page.module.css`

Delete these now-dead CSS classes entirely:
`.activityFilters`, `.filter`, `.filterActive`, `.activityItem`, `.activityIcon`, `.activityContent`, `.activityDate`, `.activityList`

---

## Step 2 — Add Notes section to "Prezentare generala" tab

**File:** `app/clients/[id]/ClientProfileClient.tsx`

Add new state:
```typescript
const [notes, setNotes] = useState<any[]>([]);
```

Add `fetchNotes()` function (reuses existing activities endpoint with `type=notes` filter):
```typescript
const fetchNotes = async () => {
  try {
    const res = await fetch(`/api/clients/${clientId}/activities?type=notes`);
    if (!res.ok) throw new Error('Failed to fetch notes');
    const result = await res.json();
    setNotes(result.activities || []);
  } catch (error) {
    logger.error('Client profile: failed to fetch notes', error instanceof Error ? error : new Error(String(error)), { clientId });
  }
};
```

Call `fetchNotes()` on mount — add it to the existing `useEffect` that already calls `fetchFiles()`:
```typescript
useEffect(() => {
  if (!clientId) return;
  fetchFiles();
  fetchNotes(); // add this line
}, [clientId]);
```

After saving a note successfully in `handleAddNote`, call `fetchNotes()` to refresh inline:
```typescript
setNoteContent('');
setShowAddNote(false);
fetchNotes(); // add this line
// fetchClientData(); — keep if needed for other stats
```

In the `activeTab === 'overview'` JSX block, add a Notes section **after** the preferred services section:
```tsx
{/* Notes section */}
<div className={styles.section}>
  <div className={styles.sectionHeader}>
    <h2>Note</h2>
    <button
      type="button"
      className={styles.sectionAction}
      onClick={() => setShowAddNote(true)}
    >
      + Nota noua
    </button>
  </div>
  {notes.length === 0 ? (
    <p className={styles.emptyInline}>Nicio nota adaugata inca.</p>
  ) : (
    <div className={styles.notesList}>
      {notes.map((note) => (
        <div key={note.id} className={styles.noteItem}>
          <p className={styles.noteText}>{note.description || note.title}</p>
          <span className={styles.noteMeta}>
            {formatDate(note.activity_date || note.created_at)}
          </span>
        </div>
      ))}
    </div>
  )}
</div>
```

Remove the `+ Nota` button from `headerActions` — it now lives contextually inside the Notes section on the Overview tab.

---

## Step 3 — Proper breadcrumb back navigation

**File:** `app/clients/[id]/ClientProfileClient.tsx`

Replace:
```tsx
<Link href="/clients" className={styles.backLink} prefetch>
  Inapoi
</Link>
```

With:
```tsx
<nav className={styles.breadcrumb} aria-label="breadcrumb">
  <Link href="/clients" className={styles.breadcrumbLink} prefetch>
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
    Clienti
  </Link>
  <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
  <span className={styles.breadcrumbCurrent}>{client.name}</span>
</nav>
```

**File:** `app/clients/[id]/page.module.css`

Delete `.backLink` and `.backButton` CSS classes. Add:
```css
.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.breadcrumbLink {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--color-text-soft);
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 500;
  transition: color var(--transition-fast);
}

.breadcrumbLink:hover {
  color: var(--color-text);
}

.breadcrumbSep {
  color: var(--color-text-soft);
  font-size: 0.82rem;
  opacity: 0.45;
}

.breadcrumbCurrent {
  color: var(--color-text-muted);
  font-size: 0.82rem;
  font-weight: 500;
}
```

---

## Step 4 — Underline-style tabs (enterprise standard)

**File:** `app/clients/[id]/page.module.css`

Replace the existing `.tabs`, `.tab`, `.tabActive` rules with:
```css
.tabs {
  display: flex;
  gap: 0;
  overflow-x: auto;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-5);
}

.tab {
  padding: 0.6rem 1.1rem;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--color-text-soft);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.tab:hover {
  color: var(--color-text);
}

.tabActive {
  color: var(--color-accent);
  border-bottom-color: var(--color-accent);
}
```

**File:** `app/clients/[id]/ClientProfileClient.tsx`

For each tab button, change the active class from `styles.tabActive` to combining both classes:
```tsx
// BEFORE:
className={activeTab === 'overview' ? styles.tabActive : styles.tab}

// AFTER:
className={`${styles.tab}${activeTab === 'overview' ? ` ${styles.tabActive}` : ''}`}
```

Apply this pattern to all 4 remaining tab buttons (overview, appointments, conversations, files).

---

## Step 5 — Replace emoji file icon with inline SVG

**File:** `app/clients/[id]/ClientProfileClient.tsx`

Replace:
```tsx
<div className={styles.fileIcon}>??</div>
```

With:
```tsx
<svg
  width="18"
  height="18"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth="1.8"
  strokeLinecap="round"
  strokeLinejoin="round"
  className={styles.itemIcon}
  aria-hidden="true"
>
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
  <polyline points="14 2 14 8 20 8" />
</svg>
```

**File:** `app/clients/[id]/page.module.css`

Replace `.fileIcon` with `.itemIcon`:
```css
.itemIcon {
  flex-shrink: 0;
  color: var(--color-text-soft);
}
```

---

## Step 6 — Romanian appointment status labels

**File:** `app/clients/[id]/ClientProfileClient.tsx`

Add a helper function (alongside existing `formatDate` and `formatCurrency`):
```typescript
const formatAppointmentStatus = (status: string): string => {
  const labels: Record<string, string> = {
    completed: 'Finalizat',
    scheduled: 'Programat',
    cancelled: 'Anulat',
    'no-show': 'Absent',
  };
  return labels[status] ?? status;
};
```

In the appointments tab JSX, replace:
```tsx
{apt.status}
```
With:
```tsx
{formatAppointmentStatus(apt.status)}
```

---

## Step 7 — CSS for the new Notes section

**File:** `app/clients/[id]/page.module.css`

Add these new classes:
```css
.sectionHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.sectionAction {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-xs);
  transition: background var(--transition-fast);
}

.sectionAction:hover {
  background: rgba(77, 163, 255, 0.1);
}

.notesList {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.noteItem {
  background: rgba(9, 16, 34, 0.45);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}

.noteText {
  margin: 0 0 var(--space-2);
  color: var(--color-text-muted);
  font-size: 0.88rem;
  line-height: 1.55;
  white-space: pre-wrap;
}

.noteMeta {
  font-size: 0.74rem;
  color: var(--color-text-soft);
}

.emptyInline {
  color: var(--color-text-soft);
  font-size: 0.84rem;
  margin: 0;
}
```

---

## Result: Before vs After

| Before | After |
|--------|-------|
| 5 tabs | 4 tabs |
| Activitate (4 sub-filters: Toate/Notite/Email-uri/Programari) | **Removed** |
| Prezentare generala | Prezentare + Notes section at bottom |
| "+ Nota" button in page header | "+ Nota noua" button inside Notes section |
| Plain "Inapoi" text link | `← Clienti / {client name}` breadcrumb |
| Pill-border tab buttons | Underline indicator tabs |
| Emoji `??` file icon | Inline SVG document icon |
| English status "completed" | Romanian "Finalizat" |

**Header actions after:** Editeaza · + Fisier · + Programare (3 buttons, down from 4)

---

## Verification Checklist

1. `npm run dev` → navigate to `/clients/{id}`
2. Confirm 4 tabs only: Prezentare · Programari · Conversatii · Fisiere (no "Activitate")
3. "Prezentare" tab → Notes section visible at bottom with "+ Nota noua" button
4. Click "+ Nota noua" → modal opens → save → note appears inline (no full page reload)
5. Breadcrumb shows `← Clienti / {client name}` — click "Clienti" navigates to `/clients`
6. Active tab shows blue underline only, no pill border/background
7. Files tab shows SVG document icon, not emoji
8. Appointments tab: statuses show "Finalizat", "Programat", "Anulat", "Absent"
9. `npx tsc --noEmit` → 0 errors
