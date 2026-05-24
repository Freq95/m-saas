# Densa.ro — Smooth Page Transitions Redesign

> Goal: replace the current choppy "old page → skeleton flash → blur fade → real content" sequence with a single Apple-style cross-fade that feels like one continuous motion.
> Date: 2026-05-22
> Status: design proposal, ready for implementation

---

## 0. The user's complaint, restated

> "Choppy, blurry in some cases, first loads a page, super fast changes the content and then renders the actual page."
> "On mobile when I go to calendar page 2 different skeletons are loaded, and those skeletons are not 1:1 with actual web or phone view."
> "Buttons from navbar are not very responsive."

This is what the user wants:

> "An animated visual bridge between views that maintains context, minimizes cognitive load, and creates the illusion of a continuous, uninterrupted experience. Apple style."

---

## 1. Root cause analysis

The current transition stack on every route navigation does ALL of these things in sequence:

### Layer 1 — RouteTransition wrapper (the blur)

[`components/RouteTransition.tsx`](components/RouteTransition.tsx) wraps every page in `<div className="route-fade-in">`.

[`app/globals.css:122-148`](app/globals.css#L122-L148):

```css
.route-fade-in {
  animation: routeFadeIn 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
  will-change: opacity, transform, filter;
}

@keyframes routeFadeIn {
  from { opacity: 0.01; transform: translateY(8px) scale(0.995); filter: blur(1px); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
```

**The `filter: blur(1px)` is literally why text looks blurry during transitions.** Even 1px blur is visible on small UI text, especially on retina displays where 1 CSS-px is 2–3 device-px.

This animation runs **every time** the route changes — on the skeleton AND on the real content. So the user sees:

1. Skeleton renders → blur-fades in (380ms)
2. Real content replaces skeleton → blur-fades in AGAIN (380ms)

That's the "blurry, first loads a page, super fast changes the content" complaint.

### Layer 2 — server `loading.tsx` files

[`app/calendar/loading.tsx`](app/calendar/loading.tsx) — 7-column week grid skeleton
[`app/dashboard/loading.tsx`](app/dashboard/loading.tsx) — stats grid + chart skeletons
[`app/inbox/loading.tsx`](app/inbox/loading.tsx) — 320px sidebar + main pane

These render server-side during RSC fetch. **They are not responsive.** All three hardcode desktop layouts (multi-column grids, fixed sidebars). On mobile, they morph into broken-looking layouts that the real page doesn't match.

### Layer 3 — client component internal skeletons

Each page-client ALSO renders its own skeleton if SWR is still loading:

- [`DashboardPageClient.tsx:71-99`](app/dashboard/DashboardPageClient.tsx#L71-L99) — `DashboardSkeleton()`
- [`CalendarPageClient.tsx:2113-2137`](app/calendar/CalendarPageClient.tsx#L2113-L2137) — `showInitialSkeleton` branch

The client skeleton **has a different layout** than the server `loading.tsx` skeleton. So the user sees:

1. Server `loading.tsx` (layout A) — blurs in
2. RSC arrives → component mounts → client skeleton (layout B) — blurs in
3. Data arrives → real content (layout C) — blurs in

**Three layouts, three blur-fades.** This is the choppy feeling.

### Layer 4 — nav button feel

[`AppTopNav.tsx:213-215`](components/AppTopNav.tsx#L213-L215) sets `optimisticActiveSection` on click — so the underline indicator animates instantly. **That part is fine.**

What's NOT fine: the page CONTENT doesn't react to the click. There's a ~300ms gap where the indicator animated but the page is still old-page-static. Then the new page blur-fades in. The brain reads this as "the click didn't really do anything for a moment."

---

## 2. The redesign — one transition, no flash

### Core idea: View Transitions API

Modern browsers (Chrome 111+, Edge 111+, Safari 18+) support [`document.startViewTransition()`](https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API). It works like this:

1. You snapshot the current page DOM as an image.
2. You synchronously mutate the DOM (Next.js does its route swap).
3. The browser cross-fades the snapshot into the new DOM.

The result: **one cross-fade between old and new pages with no intermediate flash**. This is exactly what Apple does in iOS tab transitions and what they ported to Safari.

Firefox is implementing it (behind a flag in 2026). Until then, Firefox falls back to an instant swap — which is actually fine, often better than a fake fade.

### What the transition looks like to the user

- Click "Pacienti"
- The current calendar instantly starts dissolving into the patients list (200ms cross-fade)
- The patients page is fully visible
- **No skeleton flash. No blur. No "loading…" moment** if the data was prefetched.
- If the data needs to fetch, the skeleton appears as part of the new page (it's already-cross-faded-in), and then real content fades into the skeleton's spot with one more cross-fade.

### The mental model

Today: `OLD → blank → skeleton (blur in) → realcontent (blur in)` — 4 visual states
After: `OLD ⇄ NEW (cross-fade)` — 1 transition. If data fetch is slow, `NEW(skeleton) ⇄ NEW(real)` — one additional transition, but they share the same page identity.

---

## 3. Implementation

### Step 1 — drop the blur, drop the RouteTransition

Delete [`components/RouteTransition.tsx`](components/RouteTransition.tsx) entirely. Remove its usage from `app/layout.tsx` (or wherever it wraps `{children}`).

Remove these blocks from [`app/globals.css`](app/globals.css):

```css
.route-fade-in { /* DELETE */ }
@keyframes routeFadeIn { /* DELETE */ }
.route-fade-in.route-mobile-motion-static { /* DELETE */ }
```

Why: with View Transitions doing the work, RouteTransition becomes redundant and would double-animate.

### Step 2 — add View Transitions

In [`app/globals.css`](app/globals.css), add:

```css
/* ── View Transitions (modern browsers) ───────────────────────── */
@view-transition {
  navigation: auto;
}

::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 220ms;
  animation-timing-function: cubic-bezier(0.32, 0.72, 0, 1); /* Apple's standard easing */
}

/* Apple-style: subtle cross-fade, no blur, no scale, no translate */
::view-transition-old(root) {
  animation-name: vtFadeOut;
}
::view-transition-new(root) {
  animation-name: vtFadeIn;
}

@keyframes vtFadeOut {
  from { opacity: 1; }
  to   { opacity: 0; }
}
@keyframes vtFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Don't animate nav bar — it should feel constant across pages */
nav { view-transition-name: app-nav; }
::view-transition-old(app-nav),
::view-transition-new(app-nav) {
  animation: none;
  mix-blend-mode: normal;
}

/* Honor reduced motion */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation: none;
  }
}
```

The `@view-transition { navigation: auto; }` declaration is the new MPA-style View Transitions — but Next.js App Router uses SPA navigation, so we also need to wire it programmatically.

### Step 3 — wire navigation through `startViewTransition`

Create `lib/useViewTransitionRouter.ts`:

```ts
'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

type NavigateMethod = 'push' | 'replace';

interface ViewTransitionRouter {
  push: (href: string) => void;
  replace: (href: string) => void;
}

/**
 * Drop-in replacement for useRouter() that wraps push/replace in
 * document.startViewTransition() when available. Provides Apple-style
 * cross-fade between routes on Chrome/Edge/Safari 18+.
 * Falls back to instant navigation on browsers without VT support.
 */
export function useViewTransitionRouter(): ViewTransitionRouter {
  const router = useRouter();

  const navigate = useCallback((method: NavigateMethod, href: string) => {
    // Feature detect once per call (~free)
    const doc = typeof document !== 'undefined' ? document : null;
    const supportsVT = doc && typeof (doc as any).startViewTransition === 'function';

    if (!supportsVT) {
      router[method](href);
      return;
    }

    (doc as any).startViewTransition(() => {
      router[method](href);
    });
  }, [router]);

  return {
    push: (href) => navigate('push', href),
    replace: (href) => navigate('replace', href),
  };
}
```

### Step 4 — update nav clicks to use the transition router

In [`components/AppTopNav.tsx`](components/AppTopNav.tsx), replace the `<Link>` with a button-styled element that calls `useViewTransitionRouter().push()`:

```tsx
// At top of file
import { useViewTransitionRouter } from '@/lib/useViewTransitionRouter';

// Inside the component
const vtRouter = useViewTransitionRouter();
```

Replace each main nav `<Link>` block:

```tsx
{NAV_ITEMS.map((item) => {
  const isActive = item.key === activeSection;
  return (
    <a
      key={item.href}
      href={item.href}
      aria-label={item.label}
      data-nav-key={item.key}
      className={`${styles.link} ${isActive ? styles.activeLink : ''}`}
      onPointerDown={() => setOptimisticActiveSection(item.key)}
      onClick={(e) => {
        // Don't intercept modifier-clicks (cmd-click for new tab, etc.)
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        setOptimisticActiveSection(item.key);
        vtRouter.push(item.href);
      }}
    >
      <span className={styles.linkLabel}>{item.label}</span>
      <span className={styles.linkCompactLabel}>{item.key === 'dashboard' ? 'Dash' : item.label}</span>
      <span className={styles.linkMobileIcon}><NavItemIcon itemKey={item.key} /></span>
      {item.key === 'calendar' && <span className={styles.linkCompactIcon}><CalendarNavIcon /></span>}
      {item.key === 'clients' && <span className={styles.linkCompactIcon}><ClientsNavIcon /></span>}
    </a>
  );
})}
```

**Why `<a>` and not `<Link>`:** Next.js `<Link>` does its own client-side navigation that bypasses our wrapper. Using a plain `<a>` with `preventDefault` + our VT-wrapped router gives us control AND keeps right-click/cmd-click working (because the href is real).

Do the same for the settings link, logout button, and any other Link in the nav.

### Step 5 — delete the duplicate skeletons

For each page that has both a server `loading.tsx` and an internal client skeleton, **keep one, delete the other.** The rule: keep whichever is most 1:1 with the real layout.

#### Dashboard

[`DashboardPageClient.tsx:71-99`](app/dashboard/DashboardPageClient.tsx#L71-L99) — `DashboardSkeleton()` function. **DELETE.**
Then update the render condition (line 113):

```tsx
// BEFORE
if (isLoading && !initialDashboard) {
  return <DashboardSkeleton />;
}

// AFTER — just render nothing or empty state; loading.tsx handles the wait
if (isLoading && !initialDashboard) {
  return null; // or a tiny inline spinner
}
```

Then make [`app/dashboard/loading.tsx`](app/dashboard/loading.tsx) **truly 1:1** with the real dashboard layout — same wrapper classes, same grid structure, just empty `.skeleton` boxes inside the real boxes.

#### Calendar

[`CalendarPageClient.tsx:2111-2137`](app/calendar/CalendarPageClient.tsx#L2111-L2137) — `showInitialSkeleton` branch. **DELETE.**

```tsx
// BEFORE
const showInitialSkeleton = !hasFinishedInitialLoad && loading;
if (showInitialSkeleton) {
  return (/* skeleton JSX */);
}

// AFTER
// Server loading.tsx already covered this. Just render the real layout —
// the components inside will show their own inline loading states.
```

Update [`app/calendar/loading.tsx`](app/calendar/loading.tsx) to be responsive AND 1:1 with the real calendar:

- Desktop (>=768px): week grid (current layout, fix proportions to match real)
- Mobile (<640px): vertical day-list layout matching the actual mobile calendar

Easiest implementation: import the actual `<CalendarHeader>` / `<DayPicker>` / `<DayEventList>` components and feed them with empty data. The skeleton becomes the real shell with no events.

#### Inbox

Same pattern. Audit [`InboxPageClient.tsx`](app/inbox/InboxPageClient.tsx) for an internal skeleton; if it has one, delete it and rely on `inbox/loading.tsx`. Make `inbox/loading.tsx` responsive.

### Step 6 — make skeletons responsive

Currently the skeletons use inline `style` with hardcoded `width: 320` etc. That's why they don't match mobile.

Migrate the styles into the existing CSS modules and reuse the same class names the real page uses:

```tsx
// app/calendar/loading.tsx
import styles from './page.module.css';

export default function Loading() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.headerRow}>
          <div className="skeleton skeleton-line skeleton-title" />
          <div className="skeleton skeleton-line skeleton-action" />
        </div>
        <div className={styles.weekStrip}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="skeleton skeleton-day-cell" />
          ))}
        </div>
        <div className={styles.eventGrid}>
          <div className="skeleton skeleton-grid-fill" />
        </div>
      </main>
    </div>
  );
}
```

Then in `page.module.css`, the `.headerRow`, `.weekStrip`, `.eventGrid` classes already have mobile-responsive rules (because the real page uses them). The skeleton automatically matches.

This is the **1:1 fidelity** the user is asking for. The skeleton uses the SAME LAYOUT classes as the real page; only the contents are empty boxes.

### Step 7 — nav button responsiveness

With View Transitions in place, the click → visible motion gap drops from ~400ms (RSC fetch + blur fade) to ~0ms (VT starts the cross-fade synchronously with the click).

Additional tweak — add a tiny press effect for tactile feedback. In `AppTopNav.module.css`:

```css
.link:active {
  transform: scale(0.97);
  transition: transform 80ms ease;
}

@media (hover: hover) {
  .link:hover {
    background: var(--color-surface-hover);
  }
}
```

These exist in some form already; verify and tune.

### Step 8 — handle the patient drill-down case

`/clients/[id]` currently has no `loading.tsx`. With View Transitions, that's fine — clicking a client row will cross-fade to the detail page. If the detail RSC is slow, you'll see the empty page briefly before content arrives.

To improve: add a *minimal* `loading.tsx` for `/clients/[id]` that mirrors the detail page's frame (avatar circle + name skeleton + tab strip):

```tsx
// app/clients/[id]/loading.tsx
import styles from './page.module.css';

export default function Loading() {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className="skeleton" style={{ width: 64, height: 64, borderRadius: '50%' }} />
        <div className={styles.headerText}>
          <div className="skeleton skeleton-line" style={{ width: 180, height: 22 }} />
          <div className="skeleton skeleton-line" style={{ width: 120, height: 14, marginTop: 8 }} />
        </div>
      </header>
      <div className={styles.tabs}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-line" style={{ width: 80, height: 32, borderRadius: 8 }} />
        ))}
      </div>
    </div>
  );
}
```

But use the **real** `styles` classes from `app/clients/[id]/page.module.css` so the skeleton is positioned identically.

### Step 9 — verify on each route

After implementation, walk through these routes and confirm a single cross-fade with no skeleton flash:

| From | To | Expected behavior |
|---|---|---|
| /login | /calendar | Overlay → cross-fade → calendar skeleton (if data fetching) → real |
| /calendar | /dashboard | Cross-fade → real (cached, no skeleton) |
| /calendar | /clients | Cross-fade → real |
| /clients | /clients/[id] | Cross-fade → detail skeleton → real |
| /inbox | /calendar | Cross-fade → real |
| Mobile /calendar fresh load | — | Skeleton (responsive) → real, no layout shift |

---

## 4. What to KEEP from the previous audit

These are still right and should stay:

- `router.replace` in LoginForm (not `window.location.assign`)
- `LoginRedirectOverlay` with 400ms delay
- RSC initial data hydration (`initialCalendarList`, `initialAvailabilityBlocks`, `initialAppointments`)
- SWR `revalidateOnMount: false` when fallbackData is present
- `RoleMigrationBanner` cookie pattern
- Removed prefetch eagerness
- `loading.tsx` for `/calendar`, `/dashboard`, `/inbox` (the REAL data is slow there)

## 5. What to UNDO from the previous audit

These are still wrong and should remain rolled back:

- ~~Skeletons for `/clients` and `/settings`~~ — already rolled back, leave deleted
- ~~`router.refresh()` after `router.replace()`~~ — already rolled back, leave deleted
- ~~`refreshInterval: 60_000` in SWR hooks~~ — already rolled back, leave at 0

## 6. What this audit ADDS

- Delete `RouteTransition.tsx` and its CSS
- Delete `DashboardSkeleton()` (internal client skeleton)
- Delete `showInitialSkeleton` branch in CalendarPageClient
- Add `lib/useViewTransitionRouter.ts`
- Add View Transitions CSS rules in `globals.css`
- Refactor `AppTopNav.tsx` Links → `<a>` with VT router
- Refactor each remaining `loading.tsx` to use the page's real CSS module classes (responsive, 1:1)
- Add `loading.tsx` for `/clients/[id]` (drill-down detail)

---

## 7. Why this is the right design

### Why View Transitions and not Framer Motion / motion library

- **Zero JS bundle cost** — VT API is browser-native
- **GPU-accelerated** — runs on the compositor, not the main thread
- **Apple-style by default** — Safari shipped it; Apple's own design language uses it
- **Falls back gracefully** — Firefox just doesn't animate, which is fine

### Why cross-fade and not slide

- Slide animations need a direction (forward/back). On tab nav with 5 equal tabs, there's no natural direction.
- Apple uses slide for hierarchical navigation (push/pop on iOS), but cross-fade for tab navigation (which densa's nav is).
- Cross-fade is the safest, most universal pattern. Doesn't fight RTL languages, doesn't fight large screens.

### Why no blur

- Blur degrades text legibility during the transition window.
- Apple does NOT blur during view transitions. They use clean opacity.
- The current `filter: blur(1px)` was a design quirk that didn't help anything.

### Why 220ms

- Apple's stock duration is ~300ms for sheet presentations and ~200-250ms for tab transitions.
- 220ms is in that range; long enough to feel deliberate, short enough to not block interaction.
- The current 380ms is too long — feels sluggish on second viewing.

### Why one skeleton not two

- Two skeletons means two layout shifts visible to the user. Each shift triggers the brain's "something changed" attention response.
- One skeleton that perfectly mirrors the real layout means there's only ONE layout shift visible to the user (skeleton → real, but in the same positions).
- This is the difference between "stuttering" and "smooth filling-in."

---

## 8. Verification checklist

After implementation, test on:

- [ ] Chrome desktop — should see cross-fade on every tab switch
- [ ] Safari desktop (18+) — should see cross-fade
- [ ] Mobile Safari — should see cross-fade
- [ ] Mobile Chrome — should see cross-fade
- [ ] Firefox — should see instant swap (no animation, that's fine)
- [ ] `prefers-reduced-motion` — should see instant swap
- [ ] DevTools throttled to "Fast 3G" — skeleton appears once, then content replaces in-place without re-fade

Critical visual checks:

- [ ] **No blur visible at any point during navigation** (search the codebase for `filter: blur` after changes; should only appear in non-transition contexts)
- [ ] **Mobile calendar shows ONE skeleton, not two**, and that skeleton matches the real mobile day-picker + event list layout
- [ ] **Patient row click → detail page** has a single cross-fade, optional skeleton matches the detail page frame
- [ ] **Tab clicks** feel instant — visible motion starts on click, not 300ms later
- [ ] **Login → /calendar** flow remains: form → overlay (if slow) → cross-fade → real calendar

---

## 9. Order of execution

1. **Add View Transitions CSS + delete RouteTransition** (Steps 1-2) — biggest visible win, isolated change
2. **Wire `useViewTransitionRouter` into AppTopNav** (Steps 3-4) — enables cross-fade on tab clicks
3. **Delete client-side duplicate skeletons** (Step 5) — eliminates the two-skeleton problem
4. **Make remaining `loading.tsx` files responsive + 1:1** (Step 6) — kills layout shift on mobile
5. **Add `/clients/[id]/loading.tsx`** (Step 8) — fills the drill-down gap
6. **Verify** (Step 9) — manual walkthrough on each platform

Total estimate: 4–6 hours of focused work.

---

## 10. Risks and mitigations

**Risk:** View Transitions API has edge cases with elements that change identity across routes.
**Mitigation:** Mark the persistent nav with `view-transition-name: app-nav` so it doesn't animate. Test the calendar grid → list transition explicitly.

**Risk:** Replacing `<Link>` with `<a onClick>` loses some Next.js prefetch behavior.
**Mitigation:** Already handled by the prefetch removal in the previous audit. If we want prefetch back, add `onMouseEnter={() => router.prefetch(href)}` manually on the anchor.

**Risk:** Server `loading.tsx` content gets snapshotted by View Transitions, so a slow page would show "stuck skeleton" during the cross-fade.
**Mitigation:** This is actually FINE — the cross-fade is only 220ms; the skeleton then continues to display normally until real data arrives. The "stuck" feeling only happens if the skeleton doesn't have a shimmer animation, which all current ones do (`skeletonShimmer` in globals.css).

**Risk:** View Transitions don't play well with `position: fixed` elements that span pages (like the bottom nav on mobile).
**Mitigation:** Give the bottom nav a `view-transition-name` so it persists across the transition without animating. The CSS in Step 2 already handles this for the top nav; replicate for mobile bottom nav if it's a separate element.

---

## 11. After this lands

The next thing to revisit would be **section 7 from the original audit** — the 3× `/api/auth/session` duplicate calls. That's an orthogonal perf issue, not a UX-transition issue, but it does contribute to the post-login dead time. Tackle it as a separate pass once transitions feel right.
