# Densa.ro Tier A + Tier B Audit — 2026-05-22

> Live Playwright walkthrough of https://www.densa.ro using real account
> (95novac@gmail.com, 82 patients, full data set). Critical user flows
> exercised end-to-end; console + network swept; modal/keyboard/error-state
> behavior verified on desktop and mobile.

---

## What works cleanly

These are baseline-correct and don't need attention:

- **Login → role-based landing** (lands on /dashboard for admin, /calendar for dentist)
- **Add patient end-to-end** — form opens, validates, saves, navigates to detail page, all fields persist
- **Create appointment from calendar** — slot click → modal → service + patient name → save → toast confirmation → block appears on grid
- **Open + delete appointment** — confirmation dialog with explicit confirm button
- **Patient detail page** — stats, tab strip, actions menu, edit, delete, GDPR export all render without errors
- **Theme persistence** — toggle saves to localStorage and survives navigation
- **Logout** — modal confirm → redirects to /login → cookie cleared
- **Session expiry** — accessing /calendar while logged out correctly redirects to /login
- **Settings sub-routes** — /settings/services, /settings/calendars, /settings/team, /settings/account, /settings/gdpr all load cleanly
- **Error state "not found"** — `/clients/<bad-id>` renders graceful "Pacientul nu a fost gasit" with back link
- **Keyboard nav** — Tab order from page top hits logo → Dashboard → Inbox → Calendar in sensible order
- **Modal Escape** — Escape closes the logout modal and the ClientCreateModal

---

## Findings ranked by severity

### P0 — fix before next deploy

**1. `/inbox` hydration mismatch + RSC stream abort + 24 console errors per load**

Console on /inbox shows both React error #418 (hydration mismatch) AND #419 (RSC stream aborted). Plus 24 CSP violations from email content inside `<iframe srcdoc>` (these are *expected* but loud).

Root causes:
- **Hydration mismatch** — likely a timestamp like "21 mai 00:54" rendered with a `Date.now()`-dependent format that differs between server and client. Find the offending element by running a dev build and checking the full error message (args=[]=text&args[]= is currently truncated by minification).
- **RSC abort** — happens when navigation interrupts the streaming render. Could be the Gmail/Yahoo sync poller firing during the initial RSC stream.
- **CSP error noise** — emails embed Google Fonts and Alibaba CDN images that violate the CSP. The CSP is doing its job, but the violations flood the console.

Fix:
- **Hydration**: locate the relative-time / locale-dependent text in InboxPageClient. Wrap in `useEffect`-set state initialized to a server-safe string, or use `suppressHydrationWarning` on the offending element only.
- **CSP noise**: add `csp` header on the iframe via `sandbox` attribute (`<iframe sandbox="allow-same-origin">` with a restrictive `csp` policy that doesn't error to parent), OR set `Content-Security-Policy-Report-Only` on the srcdoc so violations don't surface as errors in the parent console.
- **RSC abort**: not directly fixable without more debugging — may resolve if hydration mismatch is fixed first (mismatch can cause cascade abort).

---

**2. `/settings/email` hydration mismatch**

Same React #418 on /settings/email. Most likely culprit: the "21 mai 00:54" last-sync timestamps rendered via `formatDistanceToNow` or similar locale-aware function on the server.

Fix: same approach — store the raw ISO timestamp server-side, format it client-side after mount, or use `suppressHydrationWarning` on the time element only.

---

**3. `/clients` hydration mismatch on mobile only**

React #418 with args `HTML` fires on /clients only when viewport is mobile. Caused by the `useIsMobile` hook initial-state bug already identified — server renders desktop layout, client detects mobile after mount, re-renders, React flags mismatch.

Fix: **already in local code** (`lib/useIsMobile.ts` lazy initializer fix) — just deploy it.

---

**4. Missing-patient page fires 4 wasted 404 API calls + logs them as errors**

Navigating to `/clients/999999` (non-existent ID) correctly shows the "Pacientul nu a fost gasit" UI, but the page **also fires `/api/clients/999999`, `/api/clients/999999/stats`, `/api/clients/999999/activities`, `/api/clients/999999/files`** — all return 404, all are logged as errors. The graceful empty state hides this, but logs are polluted.

Root cause: server detects the missing patient but the client-side ClientProfileClient still mounts and fires its fetches in parallel before realizing the patient doesn't exist.

Fix: in `app/clients/[id]/page.tsx`, when `getClient()` returns null/404, return a dedicated "not found" component instead of rendering `<ClientProfileClient>`. That way the client-side fetches never mount.

```tsx
// app/clients/[id]/page.tsx
const client = await getClient(params.id);
if (!client) {
  return <ClientNotFound />; // simple component, no SWR hooks
}
return <ClientProfileClient initialClient={client} />;
```

---

### P1 — high-impact UX or wasted load

**5. Dashboard prefetch storm — 30+ wasted RSC fetches per dashboard view**

Network log captured **30 RSC prefetches** on a single /dashboard load. Each "inactive patient" link in the dashboard widget is prefetched 2–3 times (`?_rsc=` with different cache hashes). Same pattern as the earlier prefetch issue we partially fixed in AppTopNav, but the dashboard's inline patient links escaped that change.

Each prefetch runs the full `/clients/[id]` server function = DB queries for patients the user never visits.

Fix: in [`app/dashboard/DashboardPageClient.tsx`](app/dashboard/DashboardPageClient.tsx), the inactive-patient list and top-clients list use `<Link>` to `/clients/[id]`. Add `prefetch={false}` to those Links (they're cheap to fetch on actual click since the patient list is already cached client-side).

---

**6. Modal backdrop click does NOT close ClientCreateModal**

Standard modal UX is: click outside modal = close. Densa.ro's ClientCreateModal ignores backdrop clicks — users must press Escape or click the X button. This violates user expectation set by every other modal on the web.

Fix: in [`components/ClientCreateModal.tsx`](components/ClientCreateModal.tsx), wrap the modal content in an outer div that listens for clicks and closes only if `event.target === event.currentTarget` (i.e., the click was on the backdrop, not the content). Pattern is already used in the AppTopNav logout modal, copy the approach.

Apply same fix to any other modal that lacks backdrop-dismiss (AppointmentModal needs check; ShareCalendarModal needs check).

---

**7. Focus doesn't return to trigger button when modal closes**

When the ClientCreateModal closes via Escape, focus goes to `<body>` instead of the "+ Adauga pacient" button that opened it. Keyboard users lose their place in the tab order; screen readers re-announce the page from the top.

Fix: capture `document.activeElement` when the modal opens, then call `.focus()` on it after close. Implement once in a shared `useModal()` hook or apply to each modal component's open/close handlers.

---

### P2 — cosmetic / minor

**8. `Settings → Cont` form shows empty Nume/Email fields with Save disabled**

The account-profile form at `/settings/account` shows empty input fields and a disabled Save button. Either:
- The API isn't populating the fields with the user's current name/email, OR
- It's by design — user types new values to overwrite

Either way it's confusing. If by design, the field should show the current value as placeholder or label ("Currently: 95novac@gmail.com"). If a bug, the GET endpoint isn't returning current values.

---

**9. Three duplicate `/api/auth/session` calls after login**

Same finding as the earlier audit — still happening on prod. Each `useSession()` consumer in a component subtree adds a session check at mount. Fix is to dedupe via context.

---

**10. Calendar grid renders 336+ buttons per week view**

Every 15-minute slot for 7 days × 8 hours × 4 = 224 (excluding 8 to 20) — but the actual snapshot showed ~52 per day × 7 = ~364 buttons. Each has its own aria-label like "Creeaza programare 18 mai 08:00". Heavy DOM tree for screen readers (will spam them) and a non-trivial accessibility-tree cost.

Fix options:
- Use a single click handler on the day column container, derive the time from the click position (more code, lighter DOM)
- Replace per-slot buttons with `role="button"` divs that are only clickable on a "Create mode" toggle (more keyboard nav state)

Not urgent — current pattern works, just suboptimal at scale.

---

**11. Address-book ID drift on patient creation**

When testing the appointment-creation flow, typing "Audit Test Appointment" as the patient name **created a new patient record** silently. After deleting the appointment, the patient lingered in /clients. Real users may not realize this — they create an appointment for a typo'd name and leave a duplicate contact record behind.

Fix: when creating an appointment with a never-before-seen name, surface a confirmation: "Pacient nou — adauga in clinica?" with a checkbox. Or auto-link to existing patient if the name approximately matches one already in the system (similar to how the picker probably does for known patients).

---

### Already-known issues (re-confirmed but won't re-itemize)

These were noted in previous audits and remain unfixed:
- `RouteTransition` blur (already removed in local code, not deployed)
- Same-tab nav clicks dead (fix in local code, not deployed)
- Logo dumps users to marketing page (fix in local code, not deployed)
- Mobile `useIsMobile` flash (fix in local code, not deployed)
- Calendar `force-dynamic` audit
- Bundle splitting calendar

Deploy the local changes and most of these stop showing in audits.

---

## Recommended deploy order

1. **Ship the pending local changes** (kills #3, plus the navigation/transition issues from earlier audits)
2. **Fix #4** (not-found page → don't mount ClientProfileClient) — 5 min change, kills 4 wasted requests + 4 console errors per visit
3. **Fix #6** (modal backdrop click) — applies once, fixes ~3 modals
4. **Fix #7** (focus restoration) — implement as `useModal()` hook, reuse across modals
5. **Investigate #1 + #2** (hydration mismatches on /inbox and /settings/email) — needs a dev build to see the actual mismatching text
6. **Fix #5** (dashboard prefetch storm) — `prefetch={false}` on inactive-patient/top-clients lists
7. **Fix #8** (Settings → Cont empty fields) — verify whether API returns current values
8. **Investigate #11** (silent patient creation) — UX call, not a bug per se

Tier A + Tier B together: estimated 3–5 hours of focused work for the P0/P1 fixes.

---

## Test artifacts

- Created and deleted a test patient (`Test Audit Patient`) on /clients
- Created and deleted a test appointment on /calendar Saturday 23 May 15:00 (`Audit Test Appointment` / `Control periodic`)
- Cleaned up the patient record auto-created by the appointment flow
- Toggled theme (dark → light → dark)
- No persistent data left behind from this audit

---

## What I did NOT test

- **Inbox conversation interactions** — opening a conversation, replying, marking as read (skipped because of the hydration error noise making clean signal hard)
- **Calendar drag-to-create** (Playwright touch gesture support is unreliable)
- **Mobile swipe between days** on /calendar (same reason)
- **File upload** in patient detail
- **GDPR export download** (don't want to trigger an unnecessary export)
- **Recurring appointments** flow
- **Multi-calendar share** flow (don't want to share with anyone real)
- **Forgot-password / reset-password** flows
- **Cross-browser** (Safari, Firefox) — only Chromium tested

These are worth a separate pass after the P0/P1 fixes ship.
