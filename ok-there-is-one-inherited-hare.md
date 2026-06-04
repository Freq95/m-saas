# Plan: Google Calendar two-way sync (densa ↔ Google)

## Context

A dentist customer can't migrate to densa because:

1. She shares a Google Calendar with a colleague dentist who **refuses to switch** to densa
2. Without sync, either she keeps maintaining both apps, or one of them double-books
3. She also has a second solo Google Calendar for another cabinet, which is easier (she's the only writer)

The user wants to unblock this dentist while designing for future customers in the same situation. They confirmed:

- **Critical**: when she creates an appointment in densa, it must appear in the shared Google Calendar so the colleague sees it without changing anything on their end
- **Critical**: when the colleague creates something in Google, it must appear in densa so she doesn't double-book
- **Build for future scale**: don't hard-code one user, but ship lean MVP scope
- **Second cabinet**: one-time import then drop Google entirely (she owns that calendar alone)

Intended outcome: dentist A uses densa as her single source of truth; colleague keeps using Google unchanged; bookings flow both ways automatically.

---

## Approach: asymmetric two-way sync ("Option B")

Each user owns their write channel — this avoids the conflict-resolution hell of generic two-way sync:

- **Pull (Google → densa)**: poll the shared Google Calendar every ~5 min, upsert events into the `appointments` collection as **read-only** entries (so A sees colleague's bookings)
- **Push (densa → Google)**: every time A creates / edits / deletes an appointment on a synced calendar, write the change to Google via the Calendar API (so colleague sees A's bookings)
- **Conflict**: external (Google) events are stored with `status: 'scheduled'`, so the existing `checkAppointmentConflict()` already prevents A from double-booking on top of them — no new conflict logic needed
- **Edits**: A cannot edit Google-originated events from inside densa (read-only). She can edit them in Google; the next pull picks up the change

This is what Cal.com does for its Google Calendar integration. It's the cheapest design that fully solves the colleague problem.

---

## What already exists vs what to build

**Mirror the existing Gmail integration pattern** — found at:

- OAuth flow: [`app/api/auth/google/email/route.ts`](d:/m-saas/app/api/auth/google/email/route.ts) (initiate) + [`callback/route.ts`](d:/m-saas/app/api/auth/google/email/callback/route.ts)
- Token storage + refresh: [`lib/email-integrations.ts`](d:/m-saas/lib/email-integrations.ts) + [`lib/gmail.ts`](d:/m-saas/lib/gmail.ts) `getValidAccessToken()`
- Encryption: [`lib/encryption.ts`](d:/m-saas/lib/encryption.ts) — AES-256-GCM, reuse as-is
- Sync runner pattern: [`lib/gmail-sync-runner.ts`](d:/m-saas/lib/gmail-sync-runner.ts) (fetch → upsert → record health)
- Cron entry point: [`app/api/jobs/email-sync/gmail/route.ts`](d:/m-saas/app/api/jobs/email-sync/gmail/route.ts) (guarded by `hasValidCronSecret`)
- Settings UI pattern: [`app/settings/email/EmailSettingsPageClient.tsx`](d:/m-saas/app/settings/email/EmailSettingsPageClient.tsx) — connect / disconnect / health dot / test connection

**Existing half-baked code to deprecate**: [`lib/google-calendar.ts`](d:/m-saas/lib/google-calendar.ts) has `exportToGoogleCalendar()` that pushes to the user's "primary" Google calendar via a client-supplied access token (fire-and-forget call from [`app/api/appointments/route.ts:377`](d:/m-saas/app/api/appointments/route.ts#L377)). Token isn't OAuth-stored, calendar isn't user-selectable, no pull. **Replace** with the new server-managed integration. Keep the `google_calendar_sync` collection (used for the `appointment_id ↔ google_event_id` mapping) but move logic out.

---

## Implementation

### 1. Storage — new collection `calendar_integrations`

Mirrors `email_integrations` field shape (encrypted tokens, sync health, expiry tracking) but separate collection for clean semantics. Single doc per (user, provider) — provider stays an enum so Outlook can slot in later.

```
calendar_integrations:
  id, user_id, tenant_id
  provider: 'google'
  email                              // the Google account
  encrypted_refresh_token, encrypted_access_token, token_expires_at
  is_active
  last_sync_at, last_sync_status, last_sync_error_code, ...
  created_at, updated_at
```

**Mapping** which densa calendar syncs with which Google calendar lives on the `calendars` doc (additive field):

```
calendar.external_link: null | {
  source: 'google',
  integration_id: number,           // → calendar_integrations.id
  external_calendar_id: string,     // Google calendar ID
  sync_enabled: boolean,
  last_sync_at: ISO | null,
  sync_token: string | null         // Google's incremental sync token
}
```

### 2. New Google Calendar lib

Create [`lib/google-calendar-v2.ts`](d:/m-saas/lib/google-calendar-v2.ts) (parallel to `gmail.ts`):

- `initGoogleCalendarOAuthClient()`, `getGoogleCalendarAuthUrl()` — scope: `https://www.googleapis.com/auth/calendar` + `calendar.events`, `access_type: 'offline'`, `prompt: 'consent'` (mirror Gmail OAuth)
- `getValidAccessToken()` — extract the existing helper from `gmail.ts` into `lib/google-oauth.ts` shared between Gmail + Calendar (refactor opportunity)
- `listGoogleCalendars(accessToken)` — `calendar.calendarList.list()` so the user can pick which Google cal to sync
- `fetchEvents(accessToken, externalCalendarId, syncToken | timeMin)` — `events.list()` with incremental `syncToken`. Falls back to time-bounded fetch on first sync or 410 GONE (token expired)
- `createEvent / patchEvent / deleteEvent` — for push direction

### 3. OAuth flow

- [`app/api/auth/google/calendar/route.ts`](d:/m-saas/app/api/auth/google/calendar/route.ts) — initiate (mirror Gmail route, gate with `isClinicalRole()`, state cookie)
- [`app/api/auth/google/calendar/callback/route.ts`](d:/m-saas/app/api/auth/google/calendar/callback/route.ts) — exchange code, store tokens in `calendar_integrations`, redirect to `/settings/calendars?connected=google`

### 4. Pull sync (Google → densa)

[`lib/google-calendar-sync-runner.ts`](d:/m-saas/lib/google-calendar-sync-runner.ts) — mirror `gmail-sync-runner.ts`:

For each calendar with `external_link.sync_enabled: true`:
1. Refresh access token if needed via shared helper
2. Call `fetchEvents` with `external_link.sync_token` (incremental)
3. For each event: upsert into `appointments` by `external_id`, mark `is_read_only: true`, set `external_source: 'google'`, `external_calendar_id`, link to densa `calendar_id` via the mapping
4. Map RRULE → densa `recurrence_group_id` (defer complex cases — for MVP, expand the next ~30 occurrences inline and store individually; flag the limitation in UI)
5. Persist new `sync_token` on the `calendar` doc, update `last_sync_at`, record sync health

Cron entry point [`app/api/jobs/calendar-sync/google/route.ts`](d:/m-saas/app/api/jobs/calendar-sync/google/route.ts) — same shape as the Gmail cron route.

Manual sync entry [`app/api/calendar/sync/route.ts`](d:/m-saas/app/api/calendar/sync/route.ts) — user-triggered, mirrors `/api/gmail/sync`.

### 5. Push sync (densa → Google)

New helper [`lib/google-calendar-push.ts`](d:/m-saas/lib/google-calendar-push.ts):

```
pushAppointmentToGoogle(appointment, op: 'create' | 'update' | 'delete')
```

Looks up the densa calendar's `external_link`, gets a valid access token, calls Google API, stores returned event ID into `appointment.external_id`, marks `external_sync_status: 'synced'`.

Wire into existing write paths (the existing `void exportToGoogleCalendar(...)` call gets replaced with this):

- [`app/api/appointments/route.ts`](d:/m-saas/app/api/appointments/route.ts) — POST: fire-and-forget after success
- [`app/api/appointments/[id]/route.ts`](d:/m-saas/app/api/appointments/[id]/route.ts) — PATCH + DELETE: same pattern
- Push only fires when `calendar.external_link.sync_enabled === true` and the appointment isn't itself read-only/external

Failures don't block the response — they're recorded on the appointment (`external_sync_status: 'failed'`, `external_sync_error`) and surfaced as a yellow status indicator on the appointment block.

### 6. Appointment doc additions (additive, no migration)

```
external_id: string | null
external_source: 'google' | null
external_calendar_id: string | null       // Google calendar ID
external_sync_status: 'synced' | 'pending' | 'failed' | null
external_sync_error: string | null
is_read_only: boolean                     // true for events originating from Google
```

Update [`lib/types.ts`](d:/m-saas/lib/types.ts) Appointment type. Existing `google_calendar_event_id` field can be deprecated in favor of `external_id`.

### 7. Settings UI

New section on [`app/settings/calendars/CalendarsSettingsPageClient.tsx`](d:/m-saas/app/settings/calendars/CalendarsSettingsPageClient.tsx) (or a sub-page) — "Sincronizare Google Calendar":

- **Not connected**: "Conecteaza Google Calendar" button → OAuth initiate
- **Connected**: show the Google account email + health dot + last sync; list user's Google calendars from `listGoogleCalendars()`; per-calendar toggle to map a Google cal to a densa cal (creates the `external_link`)
- **One-time import** option per Google calendar: "Importa o singura data, fara sincronizare" — runs the same pull logic once, stores events as **owned** (not `is_read_only`), then doesn't enable ongoing sync. Use this for her second cabinet.
- "Sincronizeaza acum" manual trigger + "Deconecteaza"

Gate the whole section with `isClinicalRole()` to match the Email tab's policy.

### 8. Calendar view UI (read-only indicator)

[`app/calendar/components/WeekView/AppointmentBlock.tsx`](d:/m-saas/app/calendar/components/WeekView/AppointmentBlock.tsx) — when `appointment.is_read_only`, render with a subtle visual marker (e.g. dashed border + small "G" badge or a "lock" icon). Reuse the existing `is_shared_calendar` styling slot — add `external` as a third visual variant via `getAppointmentBlockStyle()`.

[`app/calendar/components/modals/AppointmentPreviewModal.tsx`](d:/m-saas/app/calendar/components/modals/AppointmentPreviewModal.tsx) — read-only mode for external events: hide edit/delete buttons, show "Editeaza in Google Calendar →" link to `https://calendar.google.com/calendar/event?eid={external_id}`.

### 9. Conflict detection (no new code)

[`lib/calendar-conflicts.ts`](d:/m-saas/lib/calendar-conflicts.ts) already filters by `status: 'scheduled'` and ignores soft-deleted. External events get `status: 'scheduled'` on import, so they automatically participate in conflict detection. ✓

---

## MVP scope (this dentist)

1. OAuth + token storage + refresh
2. List user's Google calendars
3. Per-calendar opt-in mapping (sync enabled / disabled)
4. Polling pull every 5 min via cron (Google push notifications come later)
5. Write-through on create / update / delete (fire-and-forget, sync-status tracked)
6. Read-only visual treatment for imported events
7. One-time import option for her second cabinet
8. Settings UI to connect / disconnect / map / view health

## Deferred (post-MVP)

- Google Calendar **push notifications** (`events.watch`) for near-real-time pull. Adds webhook plumbing.
- Multiple Google accounts per user.
- Outlook Calendar (same pattern, different provider).
- Full RRULE round-trip — MVP expands next 30 occurrences inline; recurring edits stay in Google.
- Edit-through (allow editing Google-originated events from densa, write back). Complex — leave external events read-only initially.

---

## Reuse / patterns

- **Encryption**: `lib/encryption.ts` as-is for token storage
- **OAuth client init + state cookie**: copy from `app/api/auth/google/email/route.ts`
- **Token refresh + integration health**: extract `getValidAccessToken` from `lib/gmail.ts` into shared `lib/google-oauth.ts` so Gmail + Calendar share it (small refactor)
- **Sync runner shape**: `lib/gmail-sync-runner.ts` is the template — `recordIntegrationSyncResult()` works for any integration
- **Cron entry pattern**: `app/api/jobs/email-sync/gmail/route.ts` (cron-secret guard, idempotent)
- **Settings UI pattern**: `EmailSettingsPageClient.tsx` — connect button → OAuth route, health dot, test/disconnect rows, post-OAuth toast via query param
- **Conflict detection**: `lib/calendar-conflicts.ts` already covers external events automatically once they have `status: 'scheduled'`
- **AppointmentBlock visual variants**: `is_shared_calendar` slot — extend with `is_external`

---

## Critical files to modify

**New:**
- `lib/google-calendar-v2.ts`
- `lib/google-calendar-sync-runner.ts`
- `lib/google-calendar-push.ts`
- `lib/google-oauth.ts` (shared with Gmail after refactor)
- `app/api/auth/google/calendar/route.ts`
- `app/api/auth/google/calendar/callback/route.ts`
- `app/api/calendar/sync/route.ts`
- `app/api/jobs/calendar-sync/google/route.ts`
- `app/api/settings/calendar-integrations/route.ts` (GET/POST/DELETE)
- `app/api/settings/calendar-integrations/[id]/calendars/route.ts` (list Google cals + map)

**Modify:**
- `lib/types.ts` — Appointment fields
- `lib/calendar-auth.ts` or `lib/server/calendars-list.ts` — surface `external_link` on calendar reads
- `app/api/appointments/route.ts` — replace `exportToGoogleCalendar` call with `pushAppointmentToGoogle`
- `app/api/appointments/[id]/route.ts` — PATCH + DELETE hooks
- `lib/server/calendar.ts` `attachCalendarDisplayData` — populate `is_external` from `external_source` for block styling
- `app/calendar/components/WeekView/AppointmentBlock.tsx` — `is_external` visual variant
- `app/calendar/components/modals/AppointmentPreviewModal.tsx` — read-only mode
- `app/settings/calendars/CalendarsSettingsPageClient.tsx` — new "Google Calendar" section
- `lib/gmail.ts` — extract `getValidAccessToken` into shared helper

**Deprecate (remove after replacement is wired):**
- `lib/google-calendar.ts` `exportToGoogleCalendar` (replaced by `lib/google-calendar-push.ts`)
- The fire-and-forget call site in `app/api/appointments/route.ts:377`

---

## Verification plan

End-to-end on a local prod build (`npm run build && npm run start`) + Playwright MCP, using test.dentist1 + a real Google account.

**Setup:**
1. Google Cloud Console: add `Google Calendar API` scope to existing OAuth client, set redirect to `http://localhost:3000/api/auth/google/calendar/callback`
2. Create a test Google Calendar "Densa Test" with 2 events (one past, one future)

**Connect flow:**
3. Log in as test.dentist1, go to `/settings/calendars`, click "Conecteaza Google Calendar" — OAuth round-trip lands back with green health dot
4. Pick "Densa Test" from the dropdown, map it to dentist1's densa calendar, enable sync

**Pull sync:**
5. Manually trigger `/api/calendar/sync` — verify 2 events appear in densa's `/calendar` view with dashed border + G badge
6. Open one of them — preview modal is read-only, "Editeaza in Google Calendar" link works
7. Add a new event in Google Calendar directly — wait 5 min for cron or trigger manual sync — verify it appears

**Push sync:**
8. Create a densa appointment on the synced calendar — verify it shows up in Google Calendar within a few seconds (fire-and-forget but fast)
9. Edit the densa appointment notes — verify Google updates
10. Delete it — verify Google deletes too

**Conflict guard:**
11. Try to create a densa appointment overlapping a Google-imported event — verify the existing 409 conflict warning fires
12. Try to PATCH a Google-imported (external, `is_read_only`) appointment from densa — verify it's rejected (403 or hidden)

**One-time import:**
13. Connect a second Google calendar (her second cabinet), choose "Importa o singura data, fara sincronizare"
14. Verify all past events imported as owned (not read-only), sync_enabled stays false
15. Edit one — verify it does NOT push to Google (no `external_link.sync_enabled`)

**Health:**
16. Revoke the OAuth grant in Google account → next sync attempt → integration shows red dot + "AUTH_REVOKED" error code
17. Reconnect → green again

**Build + types:**
18. `npm run build` clean, no TS errors

---

## Estimated effort

- ~5–7 dev days for the MVP (pull + push + UI + cron + tests)
- ~1 dev day for the one-time importer flow + UI polish
- ~1 dev day for the shared `google-oauth.ts` refactor (low-risk but touches Gmail)

Critical path: OAuth → pull sync → UI → push sync → one-time importer.
