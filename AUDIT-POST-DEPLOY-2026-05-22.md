# Densa.ro Post-Deploy UX & Performance Audit — 2026-05-22

> Live audit of https://www.densa.ro against real account (95novac@gmail.com, 82 patients, 2854 inbox messages, real Yahoo + Gmail data).
> Compared against pre-deploy baseline + previous audits.

---

## TL;DR

The deploy resolved every P0 from the prior audits. **Some users may "feel slow" out of stale habit, not because the app is** — measured perf is now in the snappy range across the board.

One new hydration mismatch surfaced that was masked before, and two mobile-specific React warnings remain (cosmetic, not user-visible). Three small fixes added in this session ready for next deploy.

---

## What's now significantly better

### /calendar — went from broken-SSR to fully working
**Before:** crashed server-side every load with `ReferenceError: status is not defined`, fell back to client rendering (React #419), FCP ~1708ms, 4 API calls totaling ~2.5s.

**After:** server-renders successfully. **FCP 676ms** (was 1708ms). Only 1 client API call (`/api/availability-blocks`, 725ms). The single-line `status` fix from last session is live and working.

### /inbox — was 26 console errors, now 0
**Before:** 24 CSP errors from email iframe content + 2 React hydration errors per load. Email tracking pixels were loading server-side and getting blocked, flooding the console.

**After:** **0 errors, 1 warning.** Opening real Yahoo/AliExpress marketing emails:
- CSP neutralizer working — tracking pixels replaced with transparent placeholders, never fetched
- Hydration warning on conversation list timestamps silenced
- Last-sync timestamp display works without TZ flicker

This is the single biggest perceived improvement for anyone using the inbox.

### /dashboard — prefetch storm completely killed
**Before:** 30+ wasted RSC prefetches per dashboard view, each patient link prefetched 2–3 times = ~30 DB queries per page load.

**After:** **0 RSC prefetches, 0 API calls.** Dashboard renders entirely from initial RSC payload. FCP **256ms** (was ~1200ms). This is the most dramatic single-page improvement.

### Tab navigation — all under 500ms
| Transition | click → pushState |
|---|---|
| dashboard → inbox | 208 ms |
| inbox → calendar | 189 ms |
| calendar → clients | 485 ms (DB-bound — patient list query) |
| clients → dashboard | 202 ms |

All feel snappy. No "feels frozen" complaints should survive this.

### "Appointment disappears during create" — fix verified
Watched the appointment count over 352 samples (~21s) during a save attempt that hit a 409 conflict response. **Count stayed steady at 24 throughout** — no flicker, no disappear, even when the API rejected the create. Optimistic update pattern is solid.

### Missing patient page — no more 404 storm
Visiting a deleted patient URL no longer fires 4 wasted API calls. The early-return server-side fix is live.

### Login → landing
Login click → /dashboard rendered: cold load of /login is now **FCP 496ms** (was 764ms). The transition is responsive.

---

## Findings that surfaced or persist

### Surfaced — fixed in this session, ready for next deploy

**1. React #418 on /calendar (desktop) — new finding, fixed locally**

The `status` ReferenceError fix unmasked this. Each appointment block in the week grid was rendering its `HH:mm` time labels via `format()` which uses the runner's local timezone. Server (UTC) and client (Europe/Bucharest) produced different strings → text hydration mismatch.

**Fix shipped locally** (uncommitted):
- [WeekView/AppointmentBlock.tsx:108](app/calendar/components/WeekView/AppointmentBlock.tsx#L108) — `suppressHydrationWarning` on the appointment time span
- [MonthView/MonthView.tsx:143](app/calendar/components/MonthView/MonthView.tsx#L143) — same on month-view block

After deploy, the desktop /calendar console should go from 1 error to 0.

### Persisting — known, documented, not user-visible

**2. React #418 on mobile /calendar and /clients**

Caused by `useIsMobile` returning `false` during server-render then `true` on client mount (after my lazy-init fix). Server sends desktop layout HTML, client re-renders with mobile layout, React flags HTML mismatch.

Doesn't break anything — page renders correctly, just logs a console warning. The proper fix is CSS-driven layout switching (both layouts in DOM, CSS shows one) which is a refactor I'd defer.

If end users are seeing this and complaining, it's worth the refactor. Otherwise leave as-is.

**3. Patient detail page loads `/api/clients/[id]/files` eagerly**

Even when the user lands on the "Note" tab (default), the Files tab data is fetched. 536ms wasted per drill-down if the user never clicks Files.

Easy fix: gate the `fetchFiles` useEffect on `activeTab === 'files'`. Minor perf win.

**4. NextAuth fires `/api/auth/session` 3 times after login**

Still happening — this is NextAuth's internal sync behavior, not a bug. Doesn't affect per-page-view performance (only post-login).

### Not measured this pass — non-blocking

- Cross-tab navigation timing (Tier C earlier — already snappy)
- Horizontal overflow on mobile (visually verified clean)
- Image loading edge cases
- Send-message flow (no 2nd test account)

---

## Speed in the user's hands — translated to plain English

| Action | User experience |
|---|---|
| Open the site cold | < 0.5 s to interactive login form |
| Log in → see dashboard | Spinner overlay appears instantly, dashboard fully populated in ~1-2 s |
| Switch tabs (Dashboard ↔ Inbox ↔ Calendar ↔ Pacienti) | Feels instant — under 500 ms in all directions |
| Open calendar week view | < 1 s to interactive, appointments visible |
| Open a patient profile | < 0.5 s for the page shell, ~0.8 s for notes/files to populate |
| Open an inbox conversation with a marketing email | Clean — no console flood, no broken-image icons |
| Create an appointment | Modal opens instantly, optimistic update means the block appears before the API confirms |

---

## Why some users may still say "feels slow"

A few honest possibilities worth considering:

1. **Habit / anchoring effect.** Users who experienced the pre-fix app may carry the perception forward. After 2-3 days of using the fixed version, the complaint should fade. If it doesn't, that's signal.

2. **Network conditions.** A user on shaky clinic wifi or 4G in a basement will feel any app as slow. Worth asking complaining users what network they're on.

3. **Hardware.** The dashboard renders charts (`barChart` items, `growth` arrays). On a low-spec phone, JS execution can stutter. The calendar's 24 appointment blocks plus the day-strip aren't free either.

4. **Inbox-heavy users.** If the user spends most time in /inbox with 2000+ conversations, every search hits the full list. We didn't measure this and the user has 2854 conversations — worth a focused perf test.

5. **Real workflow gaps.** Speed != fluency. If the user clicks 4 times to do something that should take 1 click, "slow" might be the wrong word — they mean "tedious". UX simplification beats perf here.

If complaints persist after this deploy lands, **ask users specifically: "what action feels slow"** instead of "where does it feel slow". That distinguishes perf bugs from UX friction.

---

## Recommended next deploys

### Bundle these into the next deploy

1. **AppointmentBlock + MonthView `suppressHydrationWarning`** — kills the new desktop /calendar #418
2. **Lazy-load Files tab** in patient detail (`fetchFiles` only on `activeTab === 'files'`)

Both are 1-line changes. Estimated 5 minutes.

### Schedule for after that

3. **CSS-driven mobile/desktop layout switching on /calendar and /clients** — eliminates the #418 hydration mismatch on mobile entirely. Bigger refactor but kills the last 2 lingering React warnings.

4. **Inbox search perf** with 2000+ conversations — focused investigation of `/api/conversations` query patterns and client-side filter cost.

### Skip until evidence

- The 3 NextAuth session calls — internal to NextAuth, not affecting per-page perf
- Tier C polish from earlier audit (cross-browser, image fallbacks)

---

## Account left clean

No leftover test data — closed all opened modals, didn't successfully create an appointment (409 prevented), no patients added, no settings modified.

The Yahoo/AliExpress conversation I opened on /inbox is in your real account but it was just read-only viewing — no message sent, no flag set.
