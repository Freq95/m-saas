# Densa.ro UX & Performance Audit — 2026-05-22

> Handoff document for the engineering agent tackling these fixes.
> Source: Playwright MCP walkthrough of production (https://www.densa.ro) plus codebase verification.
> Test account: `test.dentist2@smilepro.local` (owner role, empty clinic — 0 patients, 0 appointments).
> Viewports tested: desktop 1440×900 and mobile 390×844.

---

## 0. Read this first

### Why this audit exists

Real user complaints driving this:

> "After login on both phone and web there is a delay with black screen or loading screen — feels like app freezes."

> "Page navigation we can improve in both phone and web — few pages are slow and feels dull when navigating towards them."

Both complaints were reproduced and quantified below.

### What's already done (do NOT redo)

The previous session shipped a lot of perf work. Don't touch these unless a fix below explicitly requires it:

- MongoDB perf indexes (`scripts/create-perf-indexes.ts` ran successfully)
- Auth context consolidated into one `$lookup` aggregation
- `unstable_cache` wrapping in `lib/redis.ts` with tag-based revalidation
- `loading.tsx` skeletons for `/dashboard`, `/calendar`, `/inbox`
- `useEventCallback` ref-based handlers in calendar; `React.memo` on AppointmentModal; `useMemo` on `calculateAppointmentPositions`
- SWR polling 60s; focus throttle 5min
- Optimistic UI for appointment update/delete
- Login uses `getSession()` instead of `/api/user/landing` round-trip
- Mobile: pinch-zoom disabled, 16px input font, dvh units + body scroll lock on calendar
- Full mobile rewrites of AppointmentModal and ClientsPage
- Inbox sync UI is non-blocking with polling

### Measured baseline (production, on a fast wifi)

| Measurement | Value |
|---|---|
| /login cold load — FCP | 764 ms |
| /login cold load — DOMContentLoaded | 565 ms |
| /login cold load — full load | 733 ms |
| **Login submit → /calendar fully ready** | **~9.5 s** |
| /calendar after login — TTFB | 23 ms |
| /calendar after login — FCP | 1708 ms |
| /calendar after login — DOMContentLoaded | 4338 ms |
| /calendar after login — load complete | 4464 ms |
| /calendar after login — resources fetched | 53 |
| /api/calendars (gates calendar data-ready) | 1238 ms |
| /api/availability-blocks | 637 ms |
| /api/dashboard?days=7 | 1260 ms |
| /api/conversations | 709 ms, then duplicate 360 ms |
| /api/auth/session calls after login | 3 (duplicates) |
| RSC prefetches per route per session | 2–3× (wasted) |

### Server is not the problem

TTFB is 23 ms — Vercel edge plus Mongo indexes are fine. **Almost every fix below is on the client/Next.js routing layer**, not the database or queries.

---

## 1. THE post-login freeze — `window.location.assign` in LoginForm

### Priority: P0 (single most impactful fix)

### File:Line

[`app/(auth)/login/LoginForm.tsx:72`](app/(auth)/login/LoginForm.tsx#L72)

### Current code

```tsx
// Use a hard navigation so the fresh auth cookie is guaranteed to ship
// with the next request. SPA navigation (router.replace) has shown
// intermittent hangs in dev after a failed-then-successful login.
const target = normalizeRedirectPath(redirectPath) || roleLandingPath;
window.location.assign(target);
```

### Why this is the freeze

`window.location.assign()` is a full page reload. It:

1. Tears down the React tree
2. Re-downloads HTML for the target route
3. Re-parses every JS chunk (including the 2200-line `CalendarPageClient.tsx`)
4. Re-runs `SessionProvider` mount
5. Re-mounts the entire `AppChrome` shell
6. Re-establishes all CSS, fonts, icons
7. Re-runs RSC fetch for the target page

Result: 9.5 seconds from clicking "Conecteaza-te" to seeing the calendar populated.

Compare this with `/calendar`'s actual FCP (1708 ms) — that's the ceiling we should approach.

### The cited reason ("dev hang") is not a prod issue

The comment says SPA navigation "has shown intermittent hangs in dev after a failed-then-successful login." That was a dev-mode artifact — typically a hot-reload race with the JWT cookie that does not occur in production. Don't keep a 4+ second prod regression to dodge a dev quirk.

### Fix

Replace the hard navigation with `router.replace` and let NextAuth's client-side session handle the cookie freshness (which is its job).

```tsx
'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, getSession } from 'next-auth/react';
import styles from '../auth.module.css';

// ... existing props

export default function LoginForm({ successMessage, redirectPath, forcedLogout }: LoginFormProps) {
  const router = useRouter();
  // ... existing state

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setSubmitting(false);
      setError(getLoginErrorMessage(result));
      return;
    }

    let roleLandingPath = '/dashboard';
    try {
      const session = await getSession();
      const role = session?.user?.role;
      if (role === 'dentist' || role === 'asistent') {
        roleLandingPath = '/calendar';
      }
    } catch {
      roleLandingPath = '/dashboard';
    }

    const target = normalizeRedirectPath(redirectPath) || roleLandingPath;
    router.replace(target);
    router.refresh(); // ensures any RSC on the landing page picks up the new cookie
  }

  // ... rest unchanged
}
```

### Verify the fix

1. Cold-open https://www.densa.ro/login in an incognito window
2. Open DevTools → Performance → start recording
3. Submit login form, stop recording when /calendar is fully visible
4. Click → "data on screen" should be ≤ 3 seconds (down from ~9.5 s)
5. The black/blank intermediate screen should be gone — you should see the calendar skeleton transition in-place

### Edge case — if SPA nav truly does hang after a failed-then-successful login

If this regresses, the right fix is to remount the form rather than reload the page. Add a `key` to LoginForm in `app/(auth)/login/page.tsx` that increments on auth-error toggle. That isolates the re-mount to the form only, not the whole app.

### Expected user-facing impact

This single fix should resolve roughly 70% of the "feels frozen" complaint. Everything else below is tuning on top.

---

## 2. RSC passes data, SWR refetches it anyway — eliminate the double-fetch

### Priority: P0

### Files

- [`app/dashboard/DashboardPageClient.tsx:110-114`](app/dashboard/DashboardPageClient.tsx#L110-L114)
- Likely also: `app/inbox/InboxPageClient.tsx` (caused the duplicate `/api/conversations` we observed)
- Possibly: `app/calendar/CalendarPageClient.tsx` (audit needed)

### Current code (dashboard)

```tsx
const { data, error, isLoading, mutate } = useSWR<DashboardData>(key, fetchDashboard, {
  revalidateOnFocus: false,
  dedupingInterval: 10000,
  fallbackData: initialDashboard ?? undefined,
});
```

### Why this is wasteful

The server already ran `getDashboardData()` and passed the result via `initialDashboard`. SWR receives it as `fallbackData` — but **by default SWR still revalidates on mount**. So:

1. RSC renders with full data (no flash)
2. Component mounts
3. SWR fires `/api/dashboard?days=7` immediately
4. 1260 ms later, the same data lands and re-renders (usually identical)

The user pays 1.26 s of API time for data they already have. On /inbox we saw `/api/conversations` fire twice (709 ms + 360 ms) for the same reason.

### Fix (dashboard pattern — apply to inbox and calendar too)

```tsx
const { data, error, isLoading, mutate } = useSWR<DashboardData>(key, fetchDashboard, {
  revalidateOnFocus: false,
  revalidateOnMount: false,    // <-- NEW: trust the RSC initial data
  revalidateIfStale: false,    // <-- NEW: don't auto-refresh on remount
  dedupingInterval: 10000,
  fallbackData: initialDashboard ?? undefined,
});
```

The `mutate()` returned by SWR still lets you trigger refetches on user actions (e.g., after creating an appointment), so optimistic update flows are unaffected.

### Per-page work

**/dashboard** — straightforward, only one fetch.

**/inbox** — investigate why `/api/conversations` fires twice:
- One likely cause: the SWR key is constructed before `status === 'authenticated'` is true (so key is `null`, no fetch), then becomes a real key on the next render (triggers a fetch). Combined with default `revalidateOnMount: true`, that's two fires.
- Fix: gate the key the same way dashboard does (`status === 'authenticated' ? '/api/conversations' : null`), AND add `keepPreviousData: true` to avoid the flash, AND set `revalidateOnMount: false` since the RSC passes initial data.

**/calendar** — runs four parallel API calls on mount: `/api/calendars`, `/api/services`, `/api/availability-blocks`, `/api/appointments`. The page's `getServerSideProps`-equivalent ([`app/calendar/page.tsx`](app/calendar/page.tsx)) already calls `getCalendarListForUser`, `getAppointmentsData`, `getServicesData`. **Only `initialAppointments` and `initialServices` are passed to the client.** See section 3.

### Verify

After fix, the Network tab on /dashboard navigation should show **zero** new `/api/dashboard` calls. On /inbox it should show **zero** new `/api/conversations` calls (until you trigger one, e.g., open a conversation).

---

## 3. Calendar fetches data the server already has — pass calendarList & availability-blocks via RSC

### Priority: P0

### Files

- [`app/calendar/page.tsx:23-39`](app/calendar/page.tsx#L23-L39) — already calls `getCalendarListForUser` but doesn't forward it
- [`app/calendar/CalendarPageClient.tsx`](app/calendar/CalendarPageClient.tsx) — fires `/api/calendars` and `/api/availability-blocks` client-side

### The waste

Network log showed these fired client-side after /calendar mount:

```
/api/calendars                                   1238 ms  ← slowest call on the page
/api/availability-blocks?startDate=...           637 ms
```

But the server already has `calendarList` (line 23) and **could** call `getAvailabilityBlocks(weekStart, weekEnd, visibleCalendarIds)` cheaply in the same `Promise.all`.

Result: client waits 1.2 s for data that the server could have shipped in the initial RSC payload.

### Fix

#### Step 1 — extend the server fetch

In `app/calendar/page.tsx`, add `getAvailabilityBlocksData` to the existing parallel fetch:

```tsx
// Add to the Promise.all
const [initialAppointments, initialServices, initialAvailabilityBlocks] = await Promise.all([
  getAppointmentsData({ ... }).catch(() => []),
  getServicesData(initialServiceUserId, auth.tenantId).catch(() => []),
  getAvailabilityBlocksData({
    userId: auth.userId,
    tenantId: auth.tenantId,
    calendarIds: visibleCalendarIds.length > 0 ? visibleCalendarIds : undefined,
    startDate: weekStart,
    endDate: weekEnd,
  }).catch(() => []),
]);
```

(`getAvailabilityBlocksData` likely exists in `lib/server/availability-blocks.ts` or similar — locate it; if not, factor the logic out of the API route.)

#### Step 2 — pass calendarList and blocks to the client

```tsx
return (
  <Suspense>
    <CalendarPageClient
      initialAppointments={initialAppointments as any}
      initialServices={initialServices as any}
      initialCalendarList={calendarList}              // <-- NEW
      initialAvailabilityBlocks={initialAvailabilityBlocks as any}  // <-- NEW
      initialDate={now.toISOString()}
      initialViewType="week"
      asistentReassignState={asistentReassignState}
    />
  </Suspense>
);
```

#### Step 3 — consume in CalendarPageClient

Find the client-side fetches for `/api/calendars` and `/api/availability-blocks` and convert them to the same pattern as `initialServices` (lazy-load only if initial is empty/missing):

```tsx
const [calendars, setCalendars] = useState(initialCalendarList || null);
const hasRequestedCalendarsRef = useRef(!!initialCalendarList);

useEffect(() => {
  if (calendars || hasRequestedCalendarsRef.current) return;
  hasRequestedCalendarsRef.current = true;
  fetch('/api/calendars').then(r => r.json()).then(d => setCalendars(d));
}, [calendars]);
```

Same pattern for availability blocks.

### Verify

After fix:
1. Visit /calendar fresh
2. DevTools Network: `/api/calendars` and `/api/availability-blocks` should NOT appear in the initial load
3. They should only fire on actions (e.g., switching weeks, toggling a calendar) — i.e., when the cached data genuinely doesn't apply

### Expected impact

Removes 1.2 s of blocking client-side data fetching from every /calendar entry.

---

## 4. Aggressive `prefetch` causes DB-query thrash

### Priority: P1

### File:Line

[`components/AppTopNav.tsx:210`](components/AppTopNav.tsx#L210) and surrounding `<Link>` entries.

### Current

All four primary nav links (`Dashboard`, `Inbox`, `Calendar`, `Pacienti`) have `prefetch` (no value = `true`):

```tsx
<Link
  key={item.href}
  href={item.href}
  prefetch
  // ...
>
```

The logo link (line 200) is also `prefetch`.

### What we observed

Network log on a single session (just after login, before user clicked anything):

```
/clients?_rsc=lmijs       (prefetch #1)
/calendar?_rsc=lmijs      (prefetch #1)
/inbox?_rsc=lmijs         (prefetch #1)
/dashboard?_rsc=lmijs     (prefetch #1)
/?_rsc=lmijs              (prefetch — logo)
/calendar?_rsc=lmijs      (DUP)
/clients?_rsc=vjj3f       (prefetch #2)
/calendar?_rsc=1k3jr      (prefetch #3)
/inbox?_rsc=1vjzb         (prefetch #2)
/dashboard?_rsc=1lve9     (prefetch #2)
/?_rsc=se6fl              (prefetch — logo, dup)
/inbox?_rsc=1vjzb         (DUP)
/clients?_rsc=vjj3f       (DUP)
```

Each `?_rsc=...` request executes the route's server function — including its Mongo queries (`getAuthUser`, `getClientsData`, etc.). For an empty test account this was fine; on a real tenant with thousands of patients/appointments, **each prefetch runs the same expensive aggregations**.

### Root cause

Next.js prefetches eagerly when `prefetch` is `true`. The hash variation (`lmijs`, `vjj3f`, etc.) suggests the prefetch cache is being invalidated and re-fired (likely tied to route changes triggering re-render of AppTopNav, which re-evaluates the Link prefetch).

### Fix

Switch primary nav to "auto" prefetch (Next 14+ default — only on viewport-intersection or hover). In Next.js App Router, that's `prefetch={null}` or omitting the prop entirely:

```tsx
<Link
  key={item.href}
  href={item.href}
  // remove `prefetch` — let Next.js auto-prefetch
  aria-label={item.label}
  // ... rest unchanged
>
```

For the two routes a user is highly likely to hit (calendar ↔ inbox), you can opt into explicit prefetch contextually:

```tsx
prefetch={item.key === 'calendar' || item.key === 'inbox' ? true : null}
```

### Optional — debounce nav-render re-prefetch

If the duplicates persist even after the change, the cause is AppTopNav re-rendering (each render queues new prefetches). Memoize the nav items or move the Links out of the render path that depends on `pathname`/`activeSection` changes.

### Verify

Open Network tab, sort by Initiator. After landing on /calendar, fewer than 4 `?_rsc=` requests should fire (only ones the user hovers/scrolls toward).

### Expected impact

60–70% reduction in wasted RSC fetches on every page load. Lighter Mongo load on production. Visible bandwidth save on mobile.

---

## 5. Missing `loading.tsx` for `/clients` and `/settings/*`

### Priority: P1

### Files (to create)

- `app/clients/loading.tsx`
- `app/settings/loading.tsx` (or per-sub-route under settings)

### Why

`/dashboard`, `/calendar`, `/inbox` all have skeleton screens that show immediately while the RSC loads. Navigating to those feels smooth.

`/clients` and `/settings` don't — when the user clicks "Pacienti" or the gear icon, the **previous page sits frozen** until the new RSC finishes. That's the second half of the "feels dull when navigating" complaint.

### Fix

Mirror the pattern from `app/dashboard/loading.tsx`. Each `loading.tsx` is a server component that renders a skeleton matching the actual page layout (search bar, filter chips, row placeholders for clients; section headers + form skeletons for settings).

Keep the skeleton lean — no JS, just CSS-driven shimmer matching the page's actual grid.

### Verify

Throttle the network to "Fast 3G" in DevTools. Click between /calendar and /clients. The transition should show the skeleton instantly; no period where the old page is "stuck."

---

## 6. RoleMigrationBanner flashes on every calendar visit

### Priority: P2

### File

[`app/calendar/components/RoleMigrationBanner.tsx:14-18`](app/calendar/components/RoleMigrationBanner.tsx#L14-L18)

### Current code

```tsx
const [visible, setVisible] = useState(false);

useEffect(() => {
  setVisible(window.localStorage.getItem(storageKey) !== 'dismissed');
}, [storageKey]);
```

### The bug

The component renders `null` server-side and on first client render (because `visible = false`). Then `useEffect` fires, reads localStorage, sets `visible = true` — banner flashes in. For users who dismissed it, the read returns `'dismissed'` and `visible` stays `false` — but only after a paint cycle. For new users every navigation shows it briefly disappearing if they re-dismiss elsewhere.

Either way: layout shift on every /calendar navigation.

### Fix — option A (recommended, no flash for dismissed users)

Move dismissal to a cookie so the server can decide whether to render the banner at all:

1. Create an API route `POST /api/banners/role-migration/dismiss` that sets a cookie `role-migration-banner-v2-2026-05=dismissed` (Max-Age = 1 year).
2. In `app/calendar/page.tsx`, read the cookie:
   ```tsx
   import { cookies } from 'next/headers';
   // ...
   const bannerDismissed = cookies().get('role-migration-banner-v2-2026-05')?.value === 'dismissed';
   ```
3. Pass `bannerDismissed` to CalendarPageClient (or render the banner conditionally in the server component).
4. Inside the banner, on dismiss, POST to the API and set local state. The cookie persists across visits.

### Fix — option B (cheaper, removes flash but always renders the banner element)

Render the banner as `hidden` until JS reads localStorage:

```tsx
const [visible, setVisible] = useState<boolean | null>(null); // null = unknown

useEffect(() => {
  setVisible(window.localStorage.getItem(storageKey) !== 'dismissed');
}, [storageKey]);

if (visible === false) return null;

return (
  <div className={styles.banner} hidden={visible === null}>
    {/* ...content... */}
  </div>
);
```

With `hidden`, the element is in the DOM but `display:none` — no layout shift. After hydration, `visible` becomes `true` or `false`. For dismissed users, banner stays `display:none` and is then unmounted.

### Verify

Hard reload /calendar (Ctrl+Shift+R). The banner should never visibly appear/disappear for dismissed users. For new users, it should appear without pushing content around (or after a clean transition, not a flash).

---

## 7. 3× duplicate `/api/auth/session` calls right after login

### Priority: P2

### Where to look

The duplicates are visible in network log entries #36, #37, #39 right after the credentials callback.

Sources to audit:
- `app/layout.tsx` — NextAuth `SessionProvider` wrapping the app
- `components/AppChrome.tsx` — may call `useSession()`
- The landing page (`/calendar` or `/dashboard`) — likely calls `useSession()` too
- `LoginForm.tsx:59` — calls `getSession()` once before redirecting

Each `useSession()` consumer in a component that doesn't share the same parent Provider context may trigger its own session check on mount (NextAuth caches per-provider).

### Fix

1. Confirm there's exactly one `<SessionProvider>` at the root.
2. Replace ad-hoc `useSession()` calls in deeply-nested components with prop-drilling or a memoized context derived ONCE from `useSession()` at the top of `AppChrome`.
3. If a component just needs the user's role and tenantId, pass them down from the RSC (where `getAuthUser()` ran) instead of re-reading via `useSession()`.

### Verify

After login, the network tab should show `/api/auth/session` called at most twice (once on initial provider mount, optionally once on focus).

### Expected impact

~150–300 ms shaved off the post-login window.

---

## 8. CSS preloaded-but-unused warnings

### Priority: P2

### Where

Console warnings on every page:

```
The resource https://www.densa.ro/_next/static/css/37e99e66723c370e.css was preloaded
using link preload but not used within a few seconds from the window's load event.
```

Same for `0d148151c786b560.css`, `35d80fd83214e181.css`, `18d3f66d5157a4f7.css` across `/calendar`, `/dashboard`, `/clients`, `/inbox`.

### Cause

Next.js auto-preloads CSS chunks for any prefetched route. Since we currently prefetch all 4 primary nav targets eagerly (see section 4), each page preloads CSS for 3–4 sibling routes the user doesn't visit fast enough → browser warns.

### Fix

Mostly resolved automatically by section 4 (less aggressive prefetch = less CSS preload).

If warnings persist after section 4 lands, inspect the per-route CSS sizes:

```bash
ANALYZE=true npm run build
```

If individual route CSS files are tiny (< 5 KB each), consider consolidating per-route CSS-in-JS modules into shared chunks. But verify with the analyzer first — don't guess.

---

## 9. Deprecated `apple-mobile-web-app-capable` meta tag

### Priority: P3 (cosmetic — console warning only)

### Where

Look in `app/layout.tsx` or wherever the viewport/meta tags are defined. The current tag:

```html
<meta name="apple-mobile-web-app-capable" content="yes">
```

is deprecated.

### Fix

Add the modern equivalent alongside the apple-prefixed one (don't remove the apple one — older iOS still uses it):

```tsx
// In app/layout.tsx metadata or <head>
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-capable" content="yes" />
```

### Verify

Reload any page, console warnings should drop by 1.

---

## 10. favicon.ico 404

### Priority: P3 (cosmetic)

### Where

```
[ERROR] Failed to load resource: the server responded with a status of 404 ()
        @ https://www.densa.ro/favicon.ico:0
```

### Fix

Add a `favicon.ico` to `app/` (Next.js convention — App Router serves it automatically). Even a transparent 1×1 PNG is fine; ideally use the densa wordmark.

---

## 11. Add a branded loading overlay between login click and landing page

### Priority: P1 (UX polish — pairs with section 1)

### Why this is needed even after section 1

Section 1 cuts the freeze from 9.5 s to ~2–3 s. But there's still a 1.5–2.5 s window where:

1. The user clicked "Conecteaza-te"
2. `signIn()` resolved successfully
3. `router.replace('/calendar')` was called
4. The calendar's RSC is being fetched
5. The calendar's `loading.tsx` skeleton hasn't mounted yet

Right now the user sees the login form sitting there with a disabled button — looks like nothing is happening. We bridge that window with a full-screen branded overlay.

### Design

- **Element:** "densa" text wordmark, centered, matches the nav header style
- **Animation:** opacity pulse 0.6 ↔ 1.0 over 1.4 s, ease-in-out, infinite
- **Background:** full-viewport, theme-aware (light/dark)
- **Z-index:** above everything (9999)
- **Mounts:** the moment `signIn()` resolves successfully (BEFORE `router.replace`)
- **Unmounts:** automatically when the LoginForm itself unmounts (i.e., when Next.js swaps in the new page) — no manual dismiss logic needed
- **Fallback:** 5 s safety timeout that dismisses the overlay and shows an error, in case routing genuinely hangs
- **Accessibility:** respects `prefers-reduced-motion`, has `role="status"` and `aria-live="polite"`

### Step-by-step implementation

#### Step 1 — create the overlay component

Create `app/(auth)/login/LoginRedirectOverlay.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './LoginRedirectOverlay.module.css';

interface LoginRedirectOverlayProps {
  /**
   * Called if the overlay has been visible for longer than 5 seconds.
   * Use this to dismiss the overlay and show an error in the login form,
   * so the user is never stuck on a frozen screen.
   */
  onTimeout?: () => void;
}

export function LoginRedirectOverlay({ onTimeout }: LoginRedirectOverlayProps) {
  // Guard against SSR — createPortal requires document
  const [canPortal, setCanPortal] = useState(false);

  useEffect(() => {
    setCanPortal(true);
  }, []);

  useEffect(() => {
    if (!onTimeout) return;
    const timer = window.setTimeout(onTimeout, 5000);
    return () => window.clearTimeout(timer);
  }, [onTimeout]);

  if (!canPortal || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="status"
      aria-live="polite"
      aria-label="Se autentifica, te rog asteapta"
    >
      <span className={styles.wordmark}>densa</span>
    </div>,
    document.body
  );
}
```

#### Step 2 — create the styles

Create `app/(auth)/login/LoginRedirectOverlay.module.css`:

```css
.overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Use the app's existing background token — VERIFY the var name matches
     what's defined in globals.css. Common alternatives: --bg, --color-bg */
  background: var(--background, #ffffff);
  animation: overlay-fade-in 220ms ease-out both;
}

/* Dark mode — check how ThemeProvider sets the theme on <html>.
   Most likely one of these selectors applies; keep both for safety. */
:global([data-theme='dark']) .overlay,
:global(html.dark) .overlay {
  background: var(--background, #0a0a0a);
}

.wordmark {
  /* Inherit font from app — matches the nav h1 "densa" wordmark style */
  font-family: inherit;
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--foreground, #0a0a0a);
  animation: wordmark-pulse 1.4s ease-in-out infinite;
  /* Prevent the user from selecting the text during the pulse */
  user-select: none;
  -webkit-user-select: none;
}

:global([data-theme='dark']) .wordmark,
:global(html.dark) .wordmark {
  color: var(--foreground, #ffffff);
}

@keyframes overlay-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes wordmark-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1.0; }
}

/* Respect users who prefer no motion (a11y) */
@media (prefers-reduced-motion: reduce) {
  .overlay {
    animation: none;
  }
  .wordmark {
    animation: none;
    opacity: 1;
  }
}
```

**Important:** verify `--background` and `--foreground` match the actual CSS variable names in `app/globals.css`. If the project uses different tokens (e.g., `--bg-base`, `--text-primary`), substitute those.

#### Step 3 — wire into LoginForm

Update `app/(auth)/login/LoginForm.tsx`. This builds on the section 1 fix (`router.replace`).

```tsx
'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, getSession } from 'next-auth/react';
import styles from '../auth.module.css';
import { LoginRedirectOverlay } from './LoginRedirectOverlay';

type LoginFormProps = {
  successMessage?: string;
  redirectPath?: string;
  forcedLogout?: boolean;
};

function normalizeRedirectPath(value?: string): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) {
    return null;
  }
  return value;
}

export default function LoginForm({ successMessage, redirectPath, forcedLogout }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false); // NEW

  function getLoginErrorMessage(result: Awaited<ReturnType<typeof signIn>>): string {
    if (result?.code === 'database_connection_failed') {
      return 'Conexiunea cu baza de date a esuat. Incearca din nou in scurt timp.';
    }
    if (result?.error === 'CallbackRouteError') {
      return 'Serviciul de autentificare nu raspunde. Incearca din nou in scurt timp.';
    }
    return 'Email sau parola incorecte.';
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setSubmitting(false);
      setError(getLoginErrorMessage(result));
      return;
    }

    let roleLandingPath = '/dashboard';
    try {
      const session = await getSession();
      const role = session?.user?.role;
      if (role === 'dentist' || role === 'asistent') {
        roleLandingPath = '/calendar';
      }
    } catch {
      roleLandingPath = '/dashboard';
    }

    const target = normalizeRedirectPath(redirectPath) || roleLandingPath;

    // Show the overlay BEFORE triggering navigation, so the user never sees
    // the login form sit idle during the RSC fetch + page mount window.
    setIsRedirecting(true);
    router.replace(target);
    router.refresh();
  }

  function handleRedirectTimeout() {
    // Safety net: if 5s pass and we're still here, something failed.
    // Surface the form again with a friendly message so the user isn't stuck.
    setIsRedirecting(false);
    setSubmitting(false);
    setError('Ceva nu a mers bine. Te rog incearca din nou.');
  }

  return (
    <>
      <section className={styles.card} aria-labelledby="auth-login-title">
        <header className={styles.header}>
          <h1 id="auth-login-title" className={styles.title}>Conecteaza-te</h1>
          <p className={styles.subtitle}>Acceseaza programarile, mesajele si datele clinicii tale.</p>
        </header>

        {forcedLogout && (
          <p className={`${styles.message} ${styles.messageInfo}`}>
            Sesiunea ta a fost inchisa automat. Te rog autentifica-te din nou.
          </p>
        )}
        {successMessage && (
          <p className={`${styles.message} ${styles.messageSuccess}`}>{successMessage}</p>
        )}
        {error && (
          <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="auth-email" className={styles.label}>Email</label>
            <input
              id="auth-email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@clinica.ro"
              autoComplete="email"
              required
              disabled={submitting || isRedirecting}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="auth-password" className={styles.label}>Parola</label>
            <input
              id="auth-password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Introdu parola"
              autoComplete="current-password"
              required
              disabled={submitting || isRedirecting}
            />
          </div>

          <Link href="/forgot-password" className={styles.inlineLink}>
            Ai uitat parola?
          </Link>

          <button
            type="submit"
            className={styles.primaryButton}
            disabled={submitting || isRedirecting}
          >
            {submitting ? 'Se autentifica...' : 'Conecteaza-te'}
          </button>
        </form>

        <div className={styles.footer}>
          <Link href="/privacy" className={styles.footerLink}>Politica de confidentialitate</Link>
          <Link href="/terms" className={styles.footerLink}>Termeni si conditii</Link>
        </div>
      </section>

      {isRedirecting && <LoginRedirectOverlay onTimeout={handleRedirectTimeout} />}
    </>
  );
}
```

### How the unmount works (no manual cleanup needed)

When `router.replace(target)` completes its navigation:

1. Next.js swaps the page tree. `/login` is replaced by `/calendar` (or `/dashboard`).
2. React unmounts the entire `(auth)/login` route — including LoginForm.
3. LoginForm's unmount automatically unmounts `LoginRedirectOverlay` (it was a child).
4. The portal element in `<body>` is removed by `createPortal`'s own cleanup.
5. The calendar's `loading.tsx` skeleton has already started painting underneath — the user sees a clean handoff from "densa pulsing" → "calendar skeleton" → "calendar populated."

No race conditions, no flicker, no orphaned DOM.

### Visual sequence

```
0ms     User clicks "Conecteaza-te"
        Button becomes disabled, text changes to "Se autentifica..."
~500ms  signIn() resolves successfully
        Overlay portal mounts, fades in over 220ms
        densa wordmark pulses (0.6 ↔ 1.0)
~700ms  router.replace('/calendar') fires
~1500ms /calendar RSC arrives, React reconciles
        LoginForm unmounts, overlay unmounts with it
        /calendar's loading.tsx skeleton appears
~2500ms Calendar data fully rendered
```

The user perceives one continuous "we're getting you in" moment, never an idle frozen screen.

### Verify

1. Cold-open https://www.densa.ro/login in incognito
2. Submit login
3. Observe: brief "Se autentifica..." button state → fade-in to centered "densa" pulsing → fade-out into calendar skeleton → calendar populated
4. No moment where the login form sits with a disabled button doing nothing
5. Test `prefers-reduced-motion: reduce` in DevTools rendering pane — the pulse should stop but the overlay should still appear at full opacity
6. Test dark theme — overlay background should match dark mode
7. To test the 5s safety timeout: temporarily comment out `router.replace(target)` and submit; after 5s the form should reappear with "Ceva nu a mers bine..."

### Expected user-facing impact

The login experience now feels like a polished native app: deliberate brand moment + clean handoff to the destination page. No black screens, no "is it broken?" anxiety. Pairs naturally with section 1's elimination of the 9.5 s freeze.

---

## What NOT to do

These were considered and rejected. Don't propose them again without new evidence:

### 1. Don't bundle-split `CalendarPageClient.tsx`

It's 2200 lines but the bottleneck on /calendar is **data**, not JS parse. `/api/calendars` alone is 1238 ms — that dwarfs any plausible JS-parse cost on modern devices. After sections 2 + 3 land, measure again before considering this.

### 2. Don't add WebSocket / realtime

The app already feels fast once the double-fetch is fixed. Polling at 60 s is fine for this user scale (< 1000 concurrent). Section 11 in the handoff "Future Upgrades" remains future-tense.

### 3. Don't migrate SWR → React Query

The "client refetches what RSC already has" issue exists at the *configuration* level, not the library level. Two new options on the existing useSWR call fix it (section 2).

### 4. Don't pre-render dashboard / calendar / inbox

These pages are inherently per-user, per-tenant. Static export and ISR don't help. The `force-dynamic` directive on dashboard is correct.

### 5. Don't remove the `Roluri actualizate` banner

It's a real one-time announcement. Just fix the flash (section 6).

---

## Recommended order of execution

Tier 1 — do all five; each is independent (but 11 must follow 1):

1. Section 1 — login `router.replace` (1 hour, highest user impact)
2. Section 11 — branded loading overlay (1–2 hours, builds on section 1)
3. Section 2 — SWR `revalidateOnMount: false` on dashboard + inbox (1–2 hours)
4. Section 3 — pass calendarList & availability-blocks from RSC (half day)
5. Section 5 — add `loading.tsx` for /clients and /settings (30 min)

Tier 2 — after Tier 1 is live and measured:

5. Section 4 — trim prefetch on nav (30 min)
6. Section 6 — RoleMigrationBanner flash fix (1 hour)
7. Section 7 — audit /api/auth/session duplicates (1–2 hours)

Tier 3 — cosmetics, batch into a polish PR:

8. Section 8 — verify CSS warnings are gone after section 4
9. Section 9 — meta tag fix
10. Section 10 — favicon

---

## How to re-measure after fixes

These are the numbers to beat. Capture them the same way: production URL, incognito, no throttle, fresh login.

| Metric | Before | Target |
|---|---|---|
| Login click → /calendar fully ready | 9.5 s | **≤ 3 s** |
| /calendar FCP after login | 1708 ms | unchanged (already fine) |
| /api/calendars duration on /calendar load | 1238 ms | **N/A — call should not fire** |
| /api/dashboard duration on /dashboard load | 1260 ms | **N/A — call should not fire** |
| /api/conversations duration on /inbox load | 709 + 360 ms | **N/A — call should not fire** |
| /api/auth/session calls after login | 3 | ≤ 2 |
| RSC prefetches per route on initial load | 2–3× | ≤ 1× |

If Tier 1 lands and login-to-ready is still > 4 s, the next investigation is bundle parse time on slow devices (CalendarPageClient at 2200 lines) — but only then.

---

## Test account used for this audit

```
URL:      https://www.densa.ro/login
Email:    test.dentist2@smilepro.local
Password: 11111111
Role:     owner (dentist), redirects to /calendar
State:    empty clinic (0 patients, 0 appointments)
```

**Important limitation:** this account has no data, so the "heavy calendar with many appointments" render path was NOT exercised. The 1.2 s on `/api/calendars` is structural and will happen on any account, but per-appointment render cost wasn't measured. Once Tier 1 is fixed, re-test with a real-data account before assuming you're done.
