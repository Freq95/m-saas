# Multi-Calendar & Calendar Sharing — Implementation Plan

**Created:** 2026-04-06
**Status:** APPROVED, NOT STARTED

---

## Context

The app currently has a flat calendar model: each user sees all their own appointments filtered by `{ user_id, tenant_id }`. There is no concept of separate "calendars" and no way to share appointment visibility/editing across users or tenants.

**Goal:** Add multi-calendar support (personal default + per-chair/cabinet calendars), Google Calendar-style sidebar with toggle visibility, cross-tenant calendar sharing with granular permissions, and dentist-colored appointments on shared calendars.

**User decisions:**
- Auto-create a default "My Calendar" per user + manual chair calendars
- Sidebar toggles (Google Calendar style) to overlay multiple calendars
- Sharing by email (both internal staff and external dentists from other tenants)
- Full visibility (shared users see all appointment details)
- Granular permissions: view, create, edit own, edit all, delete own, delete all
- Shared calendars: color by dentist. Solo calendars: keep category colors

---

## Phase 1: Data Layer (Foundation)

No UI changes, no breaking changes. Pure additive.

### 1.1 New collection: `calendars`

```js
{
  _id: number,                   // same as id (FlexDoc convention)
  id: number,                    // getNextNumericId('calendars')
  tenant_id: ObjectId,           // owning tenant
  owner_user_id: number,         // numeric user ID of creator
  owner_db_user_id: ObjectId,    // ObjectId of creator (globally unique)
  name: string,                  // "Calendarul meu", "Cabinet 1", etc.
  type: 'personal' | 'resource', // personal = auto-created default; resource = chair/cabinet
  resource_id: number | null,    // FK to resources.id (for type='resource')
  color: string,                 // hex color, validated: /^#[0-9a-fA-F]{6}$/
  is_default: boolean,           // true for auto-created "My Calendar"
  is_active: boolean,
  settings: {
    color_mode: 'category' | 'dentist'  // auto-switches to 'dentist' when shared
  },
  deleted_at: string | null,     // soft-delete (matches codebase convention)
  created_at: string,            // ISO
  updated_at: string             // ISO
}
```

**Indexes:**
- `{ tenant_id: 1, owner_user_id: 1, is_active: 1 }`
- `{ tenant_id: 1, resource_id: 1 }`
- `{ tenant_id: 1, owner_user_id: 1 }, { unique: true, partialFilterExpression: { is_default: true, is_active: true } }` — enforces one default per user

### 1.2 New collection: `calendar_shares`

```js
{
  _id: number,                       // same as id (FlexDoc convention)
  id: number,                        // getNextNumericId('calendar_shares')
  calendar_id: number,               // FK to calendars.id
  calendar_tenant_id: ObjectId,      // denormalized (the calendar's tenant)

  // WHO is this shared with:
  shared_with_user_id: ObjectId | null,      // filled when user exists or accepts
  shared_with_numeric_user_id: number | null, // numeric user_id (for cache invalidation)
  shared_with_email: string,                  // always present (lowercase, trimmed)
  shared_with_tenant_id: ObjectId | null,     // their tenant (for cross-tenant)

  // PERMISSIONS (granular):
  permissions: {
    can_view: true,              // always true
    can_create: boolean,         // create appointments on this calendar
    can_edit_own: boolean,       // edit appointments they created
    can_edit_all: boolean,       // edit any appointment
    can_delete_own: boolean,     // delete appointments they created
    can_delete_all: boolean      // delete any appointment
  },

  // Per-share dentist color:
  dentist_color: string,           // hex color, validated: /^#[0-9a-fA-F]{6}$/
  dentist_display_name: string,    // cached name for UI

  // Invite lifecycle:
  status: 'pending' | 'accepted' | 'declined' | 'revoked',
  invite_token_hash: string | null,  // SHA-256 hashed token for email acceptance
  expires_at: string | null,         // ISO — 7 day TTL for pending invites

  // Shared by:
  shared_by_user_id: ObjectId,
  shared_by_name: string,           // denormalized

  created_at: string,
  updated_at: string,
  accepted_at: string | null
}
```

**Indexes:**
- `{ calendar_id: 1, status: 1 }`
- `{ shared_with_user_id: 1, status: 1 }`
- `{ shared_with_email: 1, status: 1 }`
- `{ invite_token_hash: 1 }, { unique: true, partialFilterExpression: { invite_token_hash: { $ne: null } } }`
- `{ calendar_id: 1, shared_with_email: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['pending', 'accepted'] } } }` — prevents duplicate active shares
- `{ expires_at: 1 }, { expireAfterSeconds: 0 }` — auto-prune expired pending invites

### 1.3 Modified collection: `appointments`

Add two new fields (null for all existing docs):

- `calendar_id: number | null` — FK to calendars.id
- `created_by_user_id: ObjectId | null` — who physically created it (important for shared calendars; null = calendar owner)

**New index:** `{ calendar_id: 1, start_time: 1 }` (no `deleted_at` — ineffective for `$exists: false` queries)

**Why `created_by_user_id` as ObjectId?** The numeric `user_id` is scoped per-tenant. An external dentist's numeric ID could collide. ObjectId (`dbUserId`) is globally unique.

**Permission rule for null `created_by_user_id`:** If `created_by_user_id` is null (legacy/migrated appointments), only `can_edit_all` / `can_delete_all` grants access. The `can_edit_own` path requires a non-null match. Migration should backfill `created_by_user_id` with the calendar owner's `owner_db_user_id`.

### 1.4 Migration file

**Create:** `migrations/003_add_calendars.js`

Two phases:
1. Create collections + all indexes listed above
2. Backfill: for every distinct `(tenant_id, user_id)` pair in `appointments`, create a default calendar doc and `$set` `calendar_id` on those appointments

### 1.5 Auth layer — cross-tenant permission engine

**Create:** `lib/calendar-auth.ts`

Core function:
```
getCalendarAuth(authContext, calendarId) → CalendarAuthContext
```

Logic:
1. Fetch calendar doc by `id: calendarId`
2. If caller owns the calendar (`tenant_id` match + `owner_user_id` match) → return full permissions
3. Else check `calendar_shares` for an accepted share (`shared_with_user_id` match) → return share permissions
4. Neither → throw AuthError 403

**Key design:** This function does NOT filter by `authContext.tenantId`. It looks up the calendar directly and checks shares directly. This is the controlled cross-tenant bypass.

Helper functions:
- `requireCalendarPermission(calendarAuth, 'can_create')` — throws 403 if missing
- `canEditAppointment(calendarAuth, appointment, currentDbUserId)` — checks can_edit_all OR (can_edit_own + created_by match)
- `canDeleteAppointment(calendarAuth, appointment, currentDbUserId)` — same pattern

Types:
```ts
interface CalendarAuthContext {
  calendarId: number;
  calendarTenantId: ObjectId;
  calendarOwnerId: number;
  isOwner: boolean;
  permissions: CalendarPermissions;
  shareId: number | null;
  dentistColor: string | null;
}

interface CalendarPermissions {
  can_view: boolean;
  can_create: boolean;
  can_edit_own: boolean;
  can_edit_all: boolean;
  can_delete_own: boolean;
  can_delete_all: boolean;
}
```

### 1.6 Validation schemas

**Modify:** `lib/validation.ts`

Add:
- `createCalendarSchema` — `{ name, type, resourceId?, color? }`
- `updateCalendarSchema` — `{ name?, color?, colorMode? }`
- `createCalendarShareSchema` — `{ email, permissions: {...}, dentistColor? }`
- `updateCalendarShareSchema` — `{ permissions?, dentistColor? }`
- Add `calendarId: z.number().int().positive().optional()` to existing `createAppointmentSchema`

### 1.7 Cache keys

**Modify:** `lib/cache-keys.ts`

Add:
- `calendarListCacheKey(dbUserId)` — for user's calendar list
- `calendarAppointmentsCacheKey(calendarId, params)` — per-calendar appointments
- Update `invalidateReadCaches` to accept optional `calendarId` and invalidate all shared users' caches

**Files for Phase 1:**
| Action | File |
|--------|------|
| Create | `migrations/003_add_calendars.js` |
| Create | `lib/calendar-auth.ts` |
| Modify | `lib/validation.ts` |
| Modify | `lib/cache-keys.ts` |

**Verify:** Run migration. Verify existing appointments get `calendar_id`. Run `npm run build && npx tsc --noEmit`.

---

## Phase 2: Calendar CRUD APIs

### 2.1 Calendar list + create

**Create:** `app/api/calendars/route.ts`

- **GET** — returns `{ ownCalendars: [...], sharedCalendars: [...] }`
  - Own: query `calendars` by `{ tenant_id, owner_user_id, is_active: true }`
  - Shared: query `calendar_shares` by `{ shared_with_user_id, status: 'accepted' }`, then fetch each calendar doc (cross-tenant)
- **POST** — create calendar (owner role required)
  - Auto-creates default calendar if user doesn't have one yet (idempotent)
  - Validates `resource_id` belongs to same tenant if `type='resource'`

### 2.2 Single calendar operations

**Create:** `app/api/calendars/[calendarId]/route.ts`

- **GET** — calendar details + its shares (shares visible to owner only)
- **PATCH** — update name, color, `settings.color_mode` (owner only)
- **DELETE** — soft-delete (`is_active=false`). Cannot delete `is_default=true` calendars. Owner only.

**Files for Phase 2:**
| Action | File |
|--------|------|
| Create | `app/api/calendars/route.ts` |
| Create | `app/api/calendars/[calendarId]/route.ts` |

---

## Phase 3: Calendar-Aware Appointments

Modify existing routes to support `calendarId`. Backward compatible — omitting `calendarId` preserves current behavior.

### 3.1 GET /api/appointments

**Modify:** `app/api/appointments/route.ts`

- Accept new query param `calendarIds` (comma-separated)
- If provided: for each ID, call `getCalendarAuth()` to verify access, then build `$in` query: `{ calendar_id: { $in: authorizedIds } }`
- If NOT provided: existing behavior unchanged

### 3.2 POST /api/appointments

**Modify:** `app/api/appointments/route.ts`

- Accept new body field `calendarId`
- If provided:
  - `getCalendarAuth()` + `requireCalendarPermission('can_create')`
  - Set `tenant_id` and `user_id` from calendar (not session)
  - Set `created_by_user_id` to session user's `dbUserId`
  - Set `calendar_id` to the provided value
- If NOT provided:
  - Look up user's default calendar, set `calendar_id` to it
  - Existing behavior otherwise

### 3.3 PATCH/DELETE /api/appointments/[id]

**Modify:** `app/api/appointments/[id]/route.ts`

- If appointment has `calendar_id`: **replace** the `{ user_id, tenant_id }` ownership filter with `{ id, deleted_at: { $exists: false } }` and use `getCalendarAuth()` + `canEditAppointment()` / `canDeleteAppointment()` for authorization. The tenant filter MUST be removed — otherwise cross-tenant shared users get silent 404s.
- If no `calendar_id` (legacy): existing `user_id === auth.userId` check

### 3.4 Server-side data fetching

**Modify:** `lib/server/calendar.ts` — `getAppointmentsData()`

Add alternative query mode: when `calendarIds` array is provided, build `$in` query: `{ calendar_id: { $in: calendarIds } }` (ignoring `user_id`/`tenant_id` from session). Also fetch services from each calendar's owner context, not the viewer's session.

### 3.5 Slot availability + conflict checks

**Modify:** `lib/calendar.ts` — `isSlotAvailable()`
**Modify:** `lib/calendar-conflicts.ts` — `checkAppointmentConflict()`

Add optional `calendarId` parameter. When present, filter by `calendar_id` + the calendar's `tenant_id` instead of session `user_id` + `tenant_id`.

**Files for Phase 3:**
| Action | File |
|--------|------|
| Modify | `app/api/appointments/route.ts` |
| Modify | `app/api/appointments/[id]/route.ts` |
| Modify | `lib/server/calendar.ts` |
| Modify | `lib/calendar.ts` |
| Modify | `lib/calendar-conflicts.ts` |

---

## Phase 4: Calendar Sharing APIs

### 4.1 Shares CRUD

**Create:** `app/api/calendars/[calendarId]/shares/route.ts`

- **GET** — list all shares for this calendar (owner only)
- **POST** — create share invite
  - Owner only (via `getCalendarAuth`)
  - Look up email in `users` collection (any tenant)
  - If found: create share with `shared_with_user_id`, `status='pending'`
  - If not found: generate invite token (SHA-256 hash, pattern from `lib/invite.ts`), send email, create share with `status='pending'`
  - Prevent duplicate shares (same email + calendar)

### 4.2 Single share management

**Create:** `app/api/calendars/[calendarId]/shares/[shareId]/route.ts`

- **PATCH** — update permissions, `dentist_color` (owner only)
- **DELETE** — revoke (owner) or self-remove (the shared user themselves)

### 4.3 Accept/decline share

**Create:** `app/api/calendar-shares/accept/route.ts`

- **POST** `{ token }` or `{ shareId }`
  - Token-based: hash token, look up share by `invite_token_hash`, validate
  - ShareId-based: verify `shared_with_user_id` matches current user
  - Set `status='accepted'`, fill `shared_with_user_id`, `shared_with_tenant_id`, `accepted_at`
  - Auto-set calendar `settings.color_mode = 'dentist'` on first accepted share

### 4.4 Pending shares

**Create:** `app/api/calendar-shares/pending/route.ts`

- **GET** — shares where `shared_with_email` matches current user's email AND `status='pending'`

### 4.5 Share acceptance page (for email invites)

**Create:** `app/(auth)/calendar-invite/[token]/page.tsx`

Three states:
1. Logged in → accept share → redirect to `/calendar`
2. Has account but not logged in → redirect to `/login?redirect=/calendar-invite/{token}`
3. New user → registration form (name, password) → create account + auto-tenant → accept share

Reuses patterns from existing `app/(auth)/invite/[token]/page.tsx`.

**Files for Phase 4:**
| Action | File |
|--------|------|
| Create | `app/api/calendars/[calendarId]/shares/route.ts` |
| Create | `app/api/calendars/[calendarId]/shares/[shareId]/route.ts` |
| Create | `app/api/calendar-shares/accept/route.ts` |
| Create | `app/api/calendar-shares/pending/route.ts` |
| Create | `app/(auth)/calendar-invite/[token]/page.tsx` |

---

## Phase 5: UI — Calendar Sidebar + Visibility

### 5.1 New hooks

**Create:** `app/calendar/hooks/useCalendarList.ts`
- SWR fetch `GET /api/calendars` → `{ ownCalendars, sharedCalendars }`

**Create:** `app/calendar/hooks/useCalendarVisibility.ts`
- Manages `visibleCalendarIds: Set<number>` with `localStorage` persistence
- `toggleCalendar(id)`, `setAllVisible(ids)`

**Create:** `app/calendar/hooks/usePendingShares.ts`
- SWR fetch `GET /api/calendar-shares/pending`
- `acceptShare(id)`, `declineShare(id)`

### 5.2 Calendar sidebar component

**Create:** `app/calendar/components/CalendarSidebar/CalendarSidebar.tsx` + `.module.css`

```
"Calendarele mele"
  [x] Calendarul meu        [color dot] [gear icon]
  [x] Cabinet 1              [color dot] [gear icon]
  [ ] Cabinet 2              [color dot] [gear icon]
  [+ Adauga calendar]

"Partajate cu mine"
  [x] Dr. Popescu - Cab 3   [color dot]

[Invitatii (2)]              (badge if pending shares)
```

Each calendar has a checkbox to toggle visibility. Gear icon opens share/edit options (owner only).

### 5.3 Modified appointment fetching

**Modify:** `app/calendar/hooks/useAppointmentsSWR.ts`

- Add `calendarIds?: number[]` to `UseAppointmentsOptions`
- When provided, pass as query param: `?calendarIds=1,2,3`
- SWR key incorporates sorted calendarIds for cache separation
- `createAppointment` accepts and passes `calendarId` in POST body

### 5.4 Integrate sidebar into main calendar

**Modify:** `app/calendar/CalendarPageClient.tsx`

- Import CalendarSidebar, useCalendarList, useCalendarVisibility
- Render sidebar on the left (collapsible on mobile)
- Pass `visibleCalendarIds` to appointments hook
- Merge appointments from toggled-on calendars into single array for WeekView

**Modify:** `app/calendar/hooks/index.ts` — export new hooks

**Files for Phase 5:**
| Action | File |
|--------|------|
| Create | `app/calendar/hooks/useCalendarList.ts` |
| Create | `app/calendar/hooks/useCalendarVisibility.ts` |
| Create | `app/calendar/hooks/usePendingShares.ts` |
| Create | `app/calendar/components/CalendarSidebar/CalendarSidebar.tsx` |
| Create | `app/calendar/components/CalendarSidebar/CalendarSidebar.module.css` |
| Modify | `app/calendar/hooks/useAppointmentsSWR.ts` |
| Modify | `app/calendar/hooks/index.ts` |
| Modify | `app/calendar/CalendarPageClient.tsx` |

---

## Phase 6: UI — Sharing Modals + Permission-Aware CRUD

### 6.1 New modals

**Create:** `app/calendar/components/modals/ShareCalendarModal.tsx`
- Email input + Invite button
- Permission checkboxes (can_create, can_edit_own, can_edit_all, can_delete_own, can_delete_all)
- Color picker for dentist color
- List of existing shares with status + revoke button

**Create:** `app/calendar/components/modals/CalendarFormModal.tsx`
- Name, type (personal/resource), resource dropdown, color picker
- Used for both create and edit

**Create:** `app/calendar/components/modals/PendingSharesModal.tsx`
- List of pending invitations with Accept/Decline buttons

### 6.2 Modified modals

**Modify:** `app/calendar/components/modals/CreateAppointmentModal.tsx`
- Add calendar selector dropdown (when user has multiple writeable calendars)
- Show only calendars where user has `can_create` permission
- Default to currently selected/visible calendar

**Modify:** `app/calendar/components/modals/AppointmentPreviewModal.tsx`
- Show/hide Edit button based on `canEditAppointment()`
- Show/hide Delete button based on `canDeleteAppointment()`
- Display calendar name and creator name

**Files for Phase 6:**
| Action | File |
|--------|------|
| Create | `app/calendar/components/modals/ShareCalendarModal.tsx` |
| Create | `app/calendar/components/modals/CalendarFormModal.tsx` |
| Create | `app/calendar/components/modals/PendingSharesModal.tsx` |
| Modify | `app/calendar/components/modals/CreateAppointmentModal.tsx` |
| Modify | `app/calendar/components/modals/AppointmentPreviewModal.tsx` |
| Modify | `app/calendar/components/modals/index.ts` |

---

## Phase 7: UI — Color System

### 7.1 Color resolution logic

**Modify:** `app/calendar/components/WeekView/AppointmentBlock.tsx`

```
resolveAppointmentColor(appointment, calendar, sharesMap):
  if calendar.settings.color_mode === 'dentist':
    if appointment.created_by_user_id matches a share → use share's dentist_color
    if created_by_user_id is null (owner created) → use calendar.color
  else:
    getCategoryColor(appointment.category)  // existing behavior
```

**Modify:** `lib/appointment-colors.ts`
- Add `resolveAppointmentColor()` helper that encapsulates the logic above

### 7.2 Auto color_mode switching

When a calendar gets its first share accepted (in Phase 4.3 accept API) → auto-set `settings.color_mode = 'dentist'`. Calendar owner can manually toggle back to 'category' via calendar settings.

**Files for Phase 7:**
| Action | File |
|--------|------|
| Modify | `app/calendar/components/WeekView/AppointmentBlock.tsx` |
| Modify | `lib/appointment-colors.ts` |

---

## Full File Summary

### New files (16):
| File | Purpose |
|------|---------|
| `migrations/003_add_calendars.js` | Collections, indexes, backfill |
| `lib/calendar-auth.ts` | Cross-tenant permission layer |
| `app/api/calendars/route.ts` | Calendar list + create |
| `app/api/calendars/[calendarId]/route.ts` | Calendar GET/PATCH/DELETE |
| `app/api/calendars/[calendarId]/shares/route.ts` | Shares list + create invite |
| `app/api/calendars/[calendarId]/shares/[shareId]/route.ts` | Share PATCH/DELETE |
| `app/api/calendar-shares/accept/route.ts` | Accept/decline share |
| `app/api/calendar-shares/pending/route.ts` | Pending shares for user |
| `app/(auth)/calendar-invite/[token]/page.tsx` | Email invite landing page |
| `app/calendar/hooks/useCalendarList.ts` | SWR hook for calendar list |
| `app/calendar/hooks/useCalendarVisibility.ts` | Toggle state + localStorage |
| `app/calendar/hooks/usePendingShares.ts` | SWR hook for pending invites |
| `app/calendar/components/CalendarSidebar/CalendarSidebar.tsx` | Sidebar UI |
| `app/calendar/components/modals/ShareCalendarModal.tsx` | Share management UI |
| `app/calendar/components/modals/CalendarFormModal.tsx` | Calendar create/edit UI |
| `app/calendar/components/modals/PendingSharesModal.tsx` | Accept/decline invites UI |

### Modified files (14):
| File | Changes |
|------|---------|
| `lib/validation.ts` | Calendar/share Zod schemas, `calendarId` in appointment schema |
| `lib/cache-keys.ts` | Calendar-scoped cache keys + shared user invalidation |
| `lib/appointment-colors.ts` | Add `resolveAppointmentColor()` helper |
| `lib/server/calendar.ts` | Multi-calendar query mode in `getAppointmentsData()` |
| `lib/calendar.ts` | `calendarId` param in `isSlotAvailable()` |
| `lib/calendar-conflicts.ts` | `calendarId` param in conflict checks |
| `app/api/appointments/route.ts` | `calendarIds` GET, `calendarId` POST |
| `app/api/appointments/[id]/route.ts` | Calendar-based auth for PATCH/DELETE |
| `app/calendar/CalendarPageClient.tsx` | Integrate sidebar + multi-calendar state |
| `app/calendar/hooks/useAppointmentsSWR.ts` | `calendarIds` support |
| `app/calendar/hooks/index.ts` | Export new hooks |
| `app/calendar/components/WeekView/AppointmentBlock.tsx` | Dentist color mode |
| `app/calendar/components/modals/CreateAppointmentModal.tsx` | Calendar selector dropdown |
| `app/calendar/components/modals/AppointmentPreviewModal.tsx` | Permission-aware buttons |

### Reused existing patterns:
- `lib/invite.ts` — SHA-256 token hashing for share invites
- `lib/db/mongo-utils.ts` — `getNextNumericId()`, `stripMongoId()`, `getMongoDbOrThrow()`
- `lib/auth-helpers.ts` — `getAuthUser()`, `AuthContext`, `AuthError`
- `lib/rate-limit.ts` — rate limiting on write endpoints
- `lib/redis.ts` + `lib/cache-keys.ts` — caching pattern
- `lib/fetcher.ts` — `authFetcher` for SWR hooks
- `lib/email.ts` — `sendEmail()` for share invite emails

---

## Verification Plan

### After Phase 1:
- Run migration on dev DB
- Verify all existing appointments have `calendar_id` assigned
- Verify existing API routes return identical responses (no regression)
- `npm run build && npx tsc --noEmit`

### After Phase 3:
- Create appointment with `calendarId` in body → stored correctly
- GET appointments with `calendarIds` param → multi-calendar fetch works
- Verify PATCH/DELETE check permissions correctly

### After Phase 4:
- Share calendar with internal user → appears in their shared list
- Share with external email → email sent → accept via token → cross-tenant access works
- Revoke share → user loses access immediately

### Full E2E (after Phase 7):
- Create 2 calendars (Cabinet 1, Cabinet 2)
- Share Cabinet 1 with another dentist
- Both create appointments on Cabinet 1
- Verify: appointments colored by dentist on shared calendar
- Verify: solo Calendar 2 still uses category colors
- Verify: toggle calendars on/off in sidebar
- Verify: permission enforcement (read-only user cannot edit)
- `npm run build && npx tsc --noEmit`

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| `calendar_id` on appointments (not just `resource_id`) | Resources are scoped to a single tenant. The calendar abstraction provides sharing, visibility toggle, and color mode — none of which resources have. |
| Denormalized `calendar_tenant_id` on shares | MongoDB has no joins. When fetching "all calendars shared with me," we need to quickly find shares and then fetch calendars across tenants. |
| `created_by_user_id` as ObjectId (not numeric) | Numeric `user_id` is per-tenant, could collide across tenants. ObjectId is globally unique. |
| `getCalendarAuth()` bypasses tenant filter | Controlled cross-tenant access. The function looks up the calendar and share directly — this is the ONLY path that crosses tenant boundaries. |
| Existing `user_id` filter preserved | Every existing query uses `{ user_id, tenant_id }`. Changing this would require auditing dozens of files. The calendar-aware path is additive. |
| Auto `color_mode='dentist'` on first share | Eliminates a manual step. Owner can toggle back if they prefer category colors. |
| Cache invalidation for shared calendars | On appointment CRUD, invalidate caches for the calendar owner AND all accepted shares on that calendar. |

---

## Review Findings & Required Fixes

Three independent review agents analyzed this plan against the codebase. Below are all findings, organized by severity. **All HIGH and MEDIUM items must be addressed before or during implementation.**

---

### CRITICAL / HIGH Severity

#### S1. No token expiry for calendar share invites
The existing invite system (`lib/invite.ts`) sets `expires_at` (48h TTL) and has a TTL index. The plan stores `invite_token_hash` on `calendar_shares` but has **no `expires_at` field**, no TTL, and no expiry check.

**Fix:** Add `expires_at: string` to `calendar_shares` schema. Set to 7 days. Check `expires_at > now()` in acceptance endpoint. Add TTL index `{ expires_at: 1 }, { expireAfterSeconds: 0 }` on `calendar_shares` for auto-pruning expired pending invites.

#### S2. Race condition in share acceptance (TOCTOU)
Two concurrent requests with the same token could both pass validation and accept. The existing invite system mitigates this with atomic `updateOne` + `modifiedCount === 0` check.

**Fix:** Use atomic `findOneAndUpdate({ invite_token_hash, status: 'pending' }, { $set: { status: 'accepted', ... } })`. If result is null, the share was already accepted/revoked. Do NOT split into find-then-update.

#### S3. Permission escalation via null `created_by_user_id`
All existing appointments will have `created_by_user_id: null` after migration. If the edit check uses `!appointment.created_by_user_id || ...`, it would short-circuit and let `can_edit_own` users edit ALL legacy appointments.

**Fix:** Explicit rule: if `created_by_user_id` is null, only `can_edit_all` / `can_delete_all` grants access. The `can_edit_own` path requires a non-null `created_by_user_id` matching `currentDbUserId`. Additionally, the migration should backfill `created_by_user_id` with the calendar owner's `owner_db_user_id` for all existing appointments.

#### S4. `_id` convention not explicit on new collections
Every collection in the codebase uses `_id: numericId` with the `FlexDoc` pattern. The plan omits `_id` from both `calendars` and `calendar_shares` schemas. If implementer forgets to set `_id: id`, MongoDB auto-assigns ObjectId, breaking conventions and queries.

**Fix:** Explicitly add `_id: number` (same as `id`) to both collection schemas.

#### S5. Missing unique index for default calendar constraint
No unique index prevents duplicate default calendars per user. Race conditions in "auto-create default if not exists" could create duplicates.

**Fix:** Add unique partial index: `{ tenant_id: 1, owner_user_id: 1 }, { unique: true, partialFilterExpression: { is_default: true, is_active: true } }`

#### S6. Backfill misses users without appointments
Migration creates defaults only for `(tenant_id, user_id)` pairs in `appointments`. Users with no appointments get nothing. When they later create an appointment, Phase 3.2 says "look up default calendar" — but none exists.

**Fix:** Backfill from `team_members` (the authoritative source for who belongs to a tenant), not just `appointments`. Also: the appointment POST handler must find-or-create the default calendar inline (upsert), not just look it up.

#### S7. `getNextNumericId` cannot be called from .js migration
Migration files are plain `.js` using raw `MongoClient`. `getNextNumericId` is a TypeScript function importing from `@/lib/db/mongo`. It cannot be used in migrations.

**Fix:** Reimplement the counter-increment logic in raw MongoDB driver calls within the migration script (findOneAndUpdate on `counters` collection). Or batch-insert calendars with pre-computed IDs and set the counter once at the end.

#### S8. Cross-tenant auth bypass lacks audit trail
`getCalendarAuth()` creates a new auth pathway outside `getAuthUser()`. Cross-tenant access events are not logged. The existing `logDataAccess()` records the accessor's tenant — but not the calendar owner's tenant.

**Fix:** Every call to `getCalendarAuth()` that crosses a tenant boundary must generate an explicit audit log with both source and destination tenant IDs, calendar ID, and share ID.

#### S9. CalendarPageClient complexity (1,178 lines, 18 useState)
Adding sidebar, multi-calendar toggling, calendar list, pending shares, and color mode will push to ~1,500 lines with ~24 useState calls. Unmaintainable without extraction.

**Fix:** Before Phase 5, extract a `CalendarContext` provider that owns: the `useCalendar` reducer, `useAppointmentsSWR`, the new calendar/visibility/pending hooks, and modal open/close state. Child components consume slices via context.

#### S10. Mobile sidebar UX entirely undefined
The plan says "collapsible on mobile" but provides zero specifics. Mobile already has a separate render path (DayPanel, not WeekView). No existing drawer component exists.

**Fix:** Implement as a left-edge slide-in drawer triggered by a new icon button in `mobileToolbar`. Overlay with backdrop. Close on backdrop tap. Show badge count for pending shares. Must be explicitly designed, not left vague.

#### S11. Click-to-create ambiguity with multiple visible calendars
When the user clicks an empty time slot with 3 calendars visible, which calendar gets the new appointment? The plan says "Default to currently selected/visible calendar" which is ambiguous.

**Fix:** Add an `activeCalendarId` concept (distinct from visibility toggles). Clicking a calendar name in the sidebar sets it as active (subtle highlight). `handleSlotClick` passes `activeCalendarId` to the modal. User can override via dropdown.

#### S12. Stale cache after share revocation
After a share is revoked, cached appointment data for the revoked user persists for the TTL duration. They continue seeing data they should no longer access.

**Fix:** On share revocation: (a) invalidate all cache keys for the revoked user + calendar, (b) the GET appointments endpoint must always re-verify `getCalendarAuth()` outside the cache fetcher — the auth check cannot be inside `getCached()`.

---

### MEDIUM Severity

#### M1. `deleted_at` in compound index ineffective for `$exists: false`
The proposed index `{ calendar_id: 1, start_time: 1, deleted_at: 1 }` is poor because MongoDB handles `$exists: false` inefficiently in indexes.

**Fix:** Use `{ calendar_id: 1, start_time: 1 }` instead. Post-index filter on `deleted_at` is fine since `calendar_id + start_time` narrows results enough.

#### M2. No unique index for duplicate share prevention
Application-level "prevent duplicate shares" check is vulnerable to race conditions without a DB constraint.

**Fix:** Add unique partial index: `{ calendar_id: 1, shared_with_email: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['pending', 'accepted'] } } }`

#### M3. `invite_token_hash` index should be unique + partial
Matches existing pattern in `invite_tokens` collection.

**Fix:** `{ invite_token_hash: 1 }, { unique: true, partialFilterExpression: { invite_token_hash: { $ne: null } } }`

#### M4. `$or` should be `$in` for multi-calendar queries
Plan proposes `$or` across calendar IDs. `$in` on a single field is dramatically faster — single index scan with multiple point lookups vs. N separate query plans.

**Fix:** Replace all `$or` references with `$in`: `{ calendar_id: { $in: authorizedCalendarIds }, start_time: { $gte: ..., $lte: ... } }`

#### M5. PATCH/DELETE must drop tenant filter for shared appointments
Current code filters `{ id, user_id: userId, tenant_id: tenantId }`. For cross-tenant shared calendar appointments, the external dentist's session values won't match. Their requests will silently 404.

**Fix:** Explicit rule in plan: "When the appointment has a `calendar_id`, replace the `{ user_id, tenant_id }` ownership filter with `{ id, deleted_at: { $exists: false } }`, and rely entirely on `getCalendarAuth()` for authorization."

#### M6. Services lookup broken in cross-tenant context
`getAppointmentsData()` fetches services with `{ user_id, tenant_id }` from the session. For shared calendar views, services belong to the calendar owner's tenant — not the viewer's.

**Fix:** When operating in multi-calendar mode, fetch services from the calendar owner's tenant context, not the viewer's session context. Thread the calendar's `tenantId` + `owner_user_id` into the services query.

#### M7. Cache invalidation needs numeric user_id not on shares
`invalidateReadCaches` needs `{ tenantId, userId (numeric) }`. But `calendar_shares` stores `shared_with_user_id` as ObjectId. There's no numeric user_id on the share.

**Fix:** Either: (a) add `shared_with_numeric_user_id: number` to the `calendar_shares` schema, or (b) look up the user's numeric id from `users` collection when invalidating. Option (a) is better for performance — avoids N lookups per invalidation.

#### M8. Missing rate limits on 7 new write endpoints
The plan doesn't specify rate limits on any new endpoint. Share creation triggers email sending — especially dangerous without limits.

**Fix:** Apply `checkWriteRateLimit` to all POST endpoints, `checkUpdateRateLimit` to PATCH/DELETE. Add a stricter limiter for share creation (e.g., 10/hour) since it triggers outbound email.

#### M9. Email enumeration via share creation response
Cross-tenant email lookup for sharing reveals whether an email is registered based on different response behavior.

**Fix:** Return identical response ("Invitation sent") regardless of whether the email exists. Uniform behavior masks enumeration.

#### M10. Color fields need strict hex validation
Existing `color` field allows `z.string().max(120)` — too permissive. Could be an XSS vector in `style` attributes.

**Fix:** Validate all color fields as `z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be valid hex color')`. Tighten existing appointment `color` schema too.

#### M11. `getCalendarAuth()` skips user/tenant activity checks
The function doesn't verify the calendar owner's tenant is active or that the shared user's account is active. A suspended tenant's calendars remain accessible.

**Fix:** Verify `tenants.status === 'active'` for the calendar's owning tenant. Verify the share's `shared_with_user_id` corresponds to an active user.

#### M12. `is_active` soft-delete diverges from `deleted_at` convention
Every other collection uses `deleted_at: { $exists: false }`. Calendars use `is_active: boolean`. Inconsistency.

**Fix:** Add `deleted_at: string | null` to calendars schema and use the existing `deleted_at` pattern. Keep `is_active` for "disabled but not deleted" semantics if needed, or just use `deleted_at` only.

#### M13. SWR key mismatch with server-rendered fallbackData
Server component fetches appointments without `calendarIds`. After hydration, `useCalendarVisibility` loads from localStorage and adds `calendarIds` to the SWR key. `keepPreviousData: true` briefly shows old data including toggled-off calendars.

**Fix:** Only use `fallbackData` when `calendarIds` is undefined. When `calendarIds` is defined, let SWR fetch fresh. Eventually update `page.tsx` to pass `initialCalendarIds`.

#### M14. Cross-calendar drag permissions
User may drag appointments from shared calendars where they only have `can_view`. Optimistic update shows it moved before reverting.

**Fix:** Add `canEdit?: boolean` to `AppointmentBlock` props. If false, set `draggable={false}`. Thread permission info from calendar data to appointment blocks.

#### M15. Missing UI states (empty list, loading, error, optimistic)
No loading skeleton for sidebar. No error handling for share failures. No optimistic updates for share acceptance.

**Fix:** Add shimmer skeleton to CalendarSidebar. Inline validation errors + toast for ShareCalendarModal. Optimistic remove-from-pending + add-to-sidebar on share acceptance.

#### M16. Migration backfill needs batching
For large appointment collections, unbatched updates will be slow. Existing migrations only create indexes/collections.

**Fix:** Use `bulkWrite` with batches of 1000. Cursor-based approach for `(tenant_id, user_id)` pairs.

#### M17. AppointmentPreviewModal is not used in current flow
Plan says to modify it, but `CalendarPageClient` doesn't render it. Clicks open `CreateAppointmentModal` in `'view'` mode.

**Fix:** Add permission awareness to `CreateAppointmentModal` in `'view'` mode instead. Show/hide Edit/Delete buttons there.

---

### LOW Severity

#### L1. Stale denormalized names (`shared_by_name`, `dentist_display_name`)
If a user renames themselves, cached names on shares become stale. Acceptable for MVP.

**Note:** Add a TODO for a name-propagation mechanism. Alternatively, fetch names fresh from `users` when rendering the sidebar (share count is small).

#### L2. Owner can share with themselves
No validation prevents sharing a calendar with the owner's own email. Creates a dangling share.

**Fix:** Reject shares where email matches calendar owner: `if (email === ownerEmail) return 400`.

#### L3. Timing side-channel on cross-tenant email lookup
Response time differs for "email found" vs "not found." Leaks registration status.

**Fix:** Add constant-time jitter (200-500ms random delay) to share creation response.

#### L4. Missing index on `appointments.created_by_user_id`
No index supports queries filtering on this field, used in dentist color resolution.

**Fix:** Consider adding `{ calendar_id: 1, created_by_user_id: 1 }` if color resolution queries are slow.

#### L5. Color mode transition is abrupt
When `color_mode` auto-switches to `'dentist'`, appointment blocks instantly change color with no animation or explanation.

**Fix:** Add `transition: border-color 300ms, background-color 300ms` to `.appointment` CSS. Show "Partajat" badge in sidebar. Toggle color mode from sidebar gear icon (one click), not buried in settings.

---

### Pre-Implementation Prerequisite (Phase 0)

Before starting Phase 1, the following prep work must be completed:

1. **Extract CalendarContext** from CalendarPageClient.tsx — move `useCalendar`, `useAppointmentsSWR`, and modal state into a React context provider (S9)
2. **Design mobile sidebar interaction** — wireframe the slide-in drawer, trigger placement, and badge (S10)
3. **Define `activeCalendarId` concept** — UX spec for which calendar receives new appointments (S11)

---

## All Possible Flows

### A. Calendar Management

**A1. First login — default calendar auto-created**
User logs in → `GET /api/calendars` finds no calendars → endpoint auto-creates `{ name: "Calendarul meu", type: "personal", is_default: true }` → returns it in `ownCalendars` → sidebar shows one calendar checked on.

**A2. Owner creates a chair/cabinet calendar**
Owner clicks "+ Adauga calendar" in sidebar → CalendarFormModal opens → fills name ("Cabinet 1"), selects type "resource", picks a resource from dropdown, picks a color → POST /api/calendars → new calendar appears in sidebar, checked on by default.

**A3. Owner renames or recolors a calendar**
Owner clicks gear icon on a calendar → CalendarFormModal opens in edit mode → changes name/color → PATCH /api/calendars/[id] → sidebar updates immediately (optimistic).

**A4. Owner deletes a chair calendar**
Owner clicks gear icon → Delete option → confirmation modal → DELETE /api/calendars/[id] → soft-delete (`is_active: false`) → calendar disappears from sidebar → appointments remain in DB but are no longer visible in any calendar view. Blocked if `is_default: true`.

**A5. Owner toggles color mode**
Owner clicks gear icon → dropdown shows "Colorare: Categorie / Dentist" → selects one → PATCH /api/calendars/[id] `{ colorMode: 'dentist' }` → appointment blocks re-render with new color scheme.

---

### B. Calendar Visibility & Navigation

**B1. User toggles a calendar ON**
User checks the checkbox next to a calendar in sidebar → `calendarId` added to `visibleCalendarIds` set → SWR key changes to include updated `?calendarIds=1,2,3` → fetch fires → appointments from that calendar overlay on the WeekView → state persisted to localStorage.

**B2. User toggles a calendar OFF**
User unchecks the checkbox → `calendarId` removed from `visibleCalendarIds` → appointments from that calendar disappear from WeekView → SWR refetches without that calendarId → localStorage updated.

**B3. User sets active calendar (for new appointment creation)**
User clicks the calendar *name* (not the checkbox) in sidebar → that calendar gets a subtle highlight (bold or accent border) → `activeCalendarId` state updates → new appointments will default to this calendar when clicking an empty time slot.

**B4. Page reload — state restored**
User refreshes or navigates back to `/calendar` → `useCalendarVisibility` reads `visibleCalendarIds` and `activeCalendarId` from localStorage → SWR fetches with those calendarIds → sidebar checkboxes match persisted state → no flash (keepPreviousData).

**B5. Mobile sidebar open/close**
User taps new calendar icon in mobile toolbar → left-edge drawer slides in with backdrop → same CalendarSidebar content → toggles work identically → tap backdrop or swipe left to close → badge on trigger icon shows pending share count.

---

### C. Sharing — Internal (Same Clinic / Same Tenant)

**C1. Owner invites a staff member by email**
Owner clicks gear icon on a calendar → "Partajeaza" option → ShareCalendarModal opens → enters staff member's email → selects permissions (checkboxes: can_create, can_edit_own, etc.) → picks a dentist color for them → clicks "Invita" → POST /api/calendars/[id]/shares → backend finds user in same tenant → creates share with `status: 'pending'`, `shared_with_user_id` filled → response: "Invitatie trimisa".

**C2. Staff member sees pending invite**
Staff member opens `/calendar` → `usePendingShares` hook fetches `GET /api/calendar-shares/pending` → finds 1 pending share → sidebar shows badge "Invitatii (1)" → user clicks it → PendingSharesModal opens showing: "Dr. Novac ti-a partajat Cabinet 1" with Accept / Decline buttons.

**C3. Staff member accepts**
Clicks "Accepta" → POST /api/calendar-shares/accept `{ shareId }` → atomic `findOneAndUpdate` sets `status: 'accepted'`, `accepted_at` → if this is the calendar's first accepted share, auto-set `color_mode: 'dentist'` → optimistic UI: share removed from pending list, calendar appears in "Partajate cu mine" section, added to `visibleCalendarIds` → SWR refetches calendar list and appointments.

**C4. Staff member declines**
Clicks "Refuza" → POST /api/calendar-shares/accept `{ shareId, action: 'decline' }` → sets `status: 'declined'` → share removed from pending list → nothing appears in sidebar → owner sees "Declined" status in their shares list.

---

### D. Sharing — External (Cross-Tenant / Different Clinic)

**D1. Owner invites external dentist who has an account**
Owner enters external dentist's email in ShareCalendarModal → POST /api/calendars/[id]/shares → backend queries `users` collection (any tenant) → finds user in a different tenant → creates share with `shared_with_user_id`, `shared_with_tenant_id`, `status: 'pending'` → response: "Invitatie trimisa" (identical response regardless of user existence — prevents enumeration).

**D2. External dentist sees pending invite in their own clinic**
External dentist logs into their own clinic account → `GET /api/calendar-shares/pending` matches their email → pending share appears in their sidebar badge → same PendingSharesModal → Accept/Decline flow identical to C3/C4 → on acceptance, the shared calendar appears in "Partajate cu mine" with appointments from a different tenant.

**D3. Owner invites email with no account on the platform**
Owner enters email → POST /api/calendars/[id]/shares → backend queries `users` collection → no user found → generates 32-byte hex invite token → hashes with SHA-256 → stores `invite_token_hash` on the share → sets `expires_at` to 7 days → sends email via `sendEmail()` with link: `{baseUrl}/calendar-invite/{token}` → share created with `status: 'pending'`, `shared_with_user_id: null` → response: "Invitatie trimisa".

**D4. New user clicks email invite link — has no account**
Opens `/calendar-invite/[token]` → page validates token (hash, check `expires_at > now`, `status: 'pending'`) → shows registration form (name, email pre-filled, password) → user submits → creates user account + auto-tenant → sets share `status: 'accepted'`, fills `shared_with_user_id`, `shared_with_tenant_id` → redirected to `/calendar` where shared calendar is visible.

**D5. Existing user clicks email invite link — not logged in**
Opens `/calendar-invite/[token]` → token valid → page detects user exists (by email) but not authenticated → redirects to `/login?redirect=/calendar-invite/{token}` → user logs in → redirected back → share accepted automatically → redirected to `/calendar`.

**D6. Existing user clicks email invite link — already logged in**
Opens `/calendar-invite/[token]` → token valid → user authenticated → share accepted immediately → redirected to `/calendar` → shared calendar appears in sidebar.

**D7. Invite token expires**
7 days pass → TTL index auto-prunes the `calendar_shares` document (or status check rejects) → user clicks link → "Aceasta invitatie a expirat" → owner must re-invite from ShareCalendarModal.

**D8. Duplicate invite attempt**
Owner tries to share same calendar with same email again → unique partial index `{ calendar_id, shared_with_email }` where `status in ['pending', 'accepted']` rejects → API returns 409 "Acest calendar este deja partajat cu aceasta adresa de email".

---

### E. Sharing — Permission Enforcement

**E1. Shared user with `can_view` only**
User opens shared calendar → sees all appointments with full details (patient name, service, time) → Edit button hidden → Delete button hidden → `draggable={false}` on all appointment blocks → clicking an empty slot does NOT open create modal for this calendar (no `can_create`).

**E2. Shared user with `can_create`**
User clicks empty time slot → CreateAppointmentModal opens → calendar selector dropdown shows this shared calendar (since `can_create: true`) → fills form → submits → POST /api/appointments `{ calendarId }` → `getCalendarAuth()` verifies `can_create` → appointment created with `tenant_id` and `user_id` from calendar owner, `created_by_user_id` from shared user's `dbUserId` → appears on calendar with shared user's dentist color.

**E3. Shared user with `can_edit_own`**
User clicks their own appointment (created_by_user_id matches their dbUserId) → Edit button visible → can modify time, service, notes → PATCH /api/appointments/[id] → `canEditAppointment()` checks `can_edit_own` + `created_by_user_id` match → succeeds. User clicks someone else's appointment → Edit button hidden.

**E4. Shared user with `can_edit_all`**
User clicks ANY appointment on the shared calendar → Edit button visible → can modify → PATCH succeeds regardless of `created_by_user_id`.

**E5. Shared user with `can_delete_own`**
User clicks their own appointment → Delete button visible → DELETE /api/appointments/[id] → `canDeleteAppointment()` checks match → succeeds. Other users' appointments → Delete button hidden.

**E6. Shared user with `can_delete_all`**
Delete button visible on all appointments → can delete any.

**E7. Legacy appointments (null `created_by_user_id`) on newly shared calendar**
Shared user with `can_edit_own` clicks a legacy appointment → `created_by_user_id` is null → rule: null requires `can_edit_all` → Edit button hidden → only users with `can_edit_all` or the calendar owner can edit these.

**E8. Owner updates permissions on an existing share**
Owner opens ShareCalendarModal → existing shares list → clicks edit on a share → toggles permissions → PATCH /api/calendars/[id]/shares/[shareId] → immediate effect → shared user's next API request uses updated permissions → UI buttons update on next fetch.

---

### F. Sharing — Revocation & Self-Removal

**F1. Owner revokes a share**
Owner opens ShareCalendarModal → clicks "Revocare" next to a share → confirmation → DELETE /api/calendars/[id]/shares/[shareId] → `status: 'revoked'` → **cache invalidated** for the revoked user (all calendar-scoped keys purged) → shared user's sidebar removes the calendar on next fetch → any in-flight requests get 403.

**F2. Shared user self-removes**
Shared user right-clicks or uses menu on a shared calendar in sidebar → "Paraseste calendarul" → DELETE /api/calendars/[id]/shares/[shareId] (their own share) → `status: 'revoked'` → calendar disappears from their sidebar → owner sees "Removed" in shares list.

**F3. Revoked user's cached data purged**
On revocation: backend invalidates `calendarAppointmentsCacheKey(calendarId, *)` for the revoked user's scope + `calendarListCacheKey(revokedUserDbId)` → next GET re-checks `getCalendarAuth()` → 403 → UI shows error or removes calendar.

**F4. Revoked user tries direct API access**
User manually calls `GET /api/appointments?calendarIds=5` → `getCalendarAuth(auth, 5)` → no ownership, no accepted share → throws 403 "Not authorized to access this calendar".

---

### G. Appointment CRUD on Shared Calendar

**G1. External dentist creates appointment on shared chair**
External dentist selects shared calendar as active → clicks empty 10:00 slot → CreateAppointmentModal opens with calendar pre-selected → fills patient info → POST /api/appointments `{ calendarId: 5, serviceId: 3, clientName: "Ion Popescu", startTime: "..." }` → `getCalendarAuth()` returns share context → `requireCalendarPermission('can_create')` passes → appointment doc: `{ tenant_id: ownerTenant, user_id: ownerUserId, calendar_id: 5, created_by_user_id: externalDentistDbUserId, ... }` → conflict check runs against calendar 5's context → success → appointment appears in dentist's color.

**G2. External dentist edits their own appointment**
Clicks their appointment → Edit mode → changes time to 11:00 → PATCH /api/appointments/[id] `{ startTime: "..." }` → backend fetches appointment → has `calendar_id` → `getCalendarAuth()` → `canEditAppointment()` checks `can_edit_own` + `created_by_user_id === externalDentistDbUserId` → match → ownership filter uses `{ id }` only (NOT `{ user_id, tenant_id }`) → conflict re-check → success.

**G3. External dentist tries to edit owner's appointment — denied**
Clicks owner's appointment → `canEditAppointment()` → `can_edit_own` but `created_by_user_id` is null (owner created, or migrated) → null requires `can_edit_all` → not granted → Edit button was already hidden → if bypassed via API: 403.

**G4. Owner edits external dentist's appointment**
Owner clicks external dentist's appointment on the shared calendar → owner has full permissions (isOwner: true) → Edit button visible → PATCH succeeds.

**G5. Drag-and-drop reschedule on shared calendar**
External dentist drags their appointment to 14:00 → `AppointmentBlock` has `draggable={true}` (because `canEdit: true` was set from permission check) → `useDragAndDrop` fires `onReschedule(id, newStart, newEnd)` → optimistic update moves block → PATCH fires → same permission check as G2 → succeeds.

**G6. Drag-and-drop blocked for view-only user**
View-only user sees appointments → `AppointmentBlock` has `draggable={false}` → drag does not start → no API call.

**G7. Conflict detection across calendar**
External dentist tries to create appointment at 10:00-11:00 → `isSlotAvailable(userId, tenantId, start, end, { calendarId: 5 })` → checks existing appointments on calendar 5 (not the dentist's own calendar) → finds owner's appointment at 10:30-11:30 → returns unavailable → 400 "Time slot is not available" → ConflictWarningModal shows suggestion.

**G8. Appointment without calendarId (backward compatible)**
Old client or API call without `calendarId` in POST body → backend finds-or-creates default calendar for session user → assigns `calendar_id` automatically → `created_by_user_id: null` (owner created) → everything else identical to existing flow.

**G9. Legacy appointment access (no `calendar_id` in DB)**
GET /api/appointments without `calendarIds` param → existing `{ user_id, tenant_id }` filter → returns all appointments including those with `calendar_id: null` → no regression.

---

### H. Color System

**H1. Solo calendar — category colors**
User has one calendar, no shares → `color_mode: 'category'` → appointment blocks colored: consultation=#4f8ef7, treatment=#10b981, checkup=#8b5cf6, emergency=#f59e0b, other=#64748b → existing behavior preserved.

**H2. Shared calendar — dentist colors activated**
First share accepted on calendar → `color_mode` auto-set to `'dentist'` → owner's appointments use calendar's base `color` field → external dentist's appointments use their `dentist_color` from the share → `getCategoryColor()` no longer used for this calendar.

**H3. Color resolution logic**
`resolveAppointmentColor(appointment, calendar, sharesMap)`:
- If `calendar.settings.color_mode === 'dentist'`:
  - If `created_by_user_id` matches a share → return that share's `dentist_color`
  - If `created_by_user_id` is null (owner) → return `calendar.color`
- Else: return `getCategoryColor(appointment.category)` (existing behavior)

**H4. Owner toggles back to category mode on shared calendar**
Owner prefers category colors → gear icon → switches to "Categorie" → PATCH → all appointments on that calendar revert to category colors → `transition: border-color 300ms, background-color 300ms` for smooth change.

**H5. Multiple calendars overlaid with different color modes**
"Calendarul meu" (solo, category colors) + "Cabinet 1" (shared, dentist colors) both visible → WeekView renders both sets → each appointment uses its own calendar's color logic independently → visually distinguishable by color scheme.

---

### I. Audit & Security Flows

**I1. Cross-tenant access audit logging**
External dentist fetches shared calendar data → `getCalendarAuth()` detects `calendarAuth.calendarTenantId !== authContext.tenantId` → generates audit log entry: `{ action: 'cross_tenant_calendar_access', source_tenant_id, destination_tenant_id, calendar_id, share_id, actor_user_id, timestamp }`.

**I2. Suspended tenant — calendar owner's tenant**
Calendar owner's tenant set to `status: 'deleted'` → external dentist tries to access shared calendar → `getCalendarAuth()` checks `tenants.status === 'active'` for calendar's tenant → fails → 403 → all shared users lose access.

**I3. Suspended tenant — shared user's tenant**
Shared user's own tenant suspended → `getAuthUser()` already catches this (existing behavior) → 403 before `getCalendarAuth()` is even called → no access to anything.

**I4. Deactivated user with active shares**
User account set to `status: 'deleted'` → `getAuthUser()` rejects with 403 → cannot reach any calendar endpoints → shares remain in DB but are effectively dead.

**I5. Session version mismatch (password reset)**
User resets password → `session_version` incremented → existing JWT becomes stale → `getAuthUser()` detects mismatch → 401 → must re-login → calendar access resumes with new session.

**I6. Rate limiting on share creation (email spam prevention)**
Attacker tries to spam share invites to arbitrary emails → stricter rate limiter (10/hour) on POST /api/calendars/[id]/shares → 429 after limit → email sending blocked.

---

### J. Error & Edge Cases

**J1. User with no calendars and no appointments (brand new)**
`GET /api/calendars` → finds nothing → auto-creates default calendar → returns `{ ownCalendars: [defaultCalendar], sharedCalendars: [] }` → sidebar shows "Calendarul meu".

**J2. Owner tries to delete default calendar**
DELETE /api/calendars/[id] where `is_default: true` → 400 "Nu poti sterge calendarul implicit".

**J3. Owner tries to share with their own email**
POST /api/calendars/[id]/shares `{ email: "owner@email.com" }` → validation rejects → 400 "Nu poti partaja calendarul cu tine insuti".

**J4. Share creation — duplicate**
POST with same email + calendar where an active/pending share exists → unique index rejects → 409 "Acest calendar este deja partajat cu aceasta adresa".

**J5. Accept already-accepted share (race condition)**
Two concurrent POST /api/calendar-shares/accept with same token → first succeeds via atomic `findOneAndUpdate({ status: 'pending' })` → second finds no matching doc → 404 or 409 "Invitatie deja acceptata".

**J6. Accept expired invite**
POST /api/calendar-shares/accept `{ token }` → hash token → find share → `expires_at < now()` → 410 "Aceasta invitatie a expirat".

**J7. Network error during share acceptance**
User clicks Accept → POST fails (network) → optimistic update reverts (share reappears in pending list) → toast: "Eroare de retea. Incearca din nou."

**J8. Calendar with 0 appointments visible**
Calendar toggled on but has no appointments in current week → WeekView shows empty grid for that calendar → no special handling needed.

**J9. Resource deleted after calendar creation**
Resource (chair) soft-deleted → calendar still references `resource_id` → calendar remains functional → appointments unaffected → resource name may show as stale in UI (acceptable, same as service_name snapshot pattern).

**J10. Multiple external dentists on same chair**
Owner shares "Cabinet 1" with Dr. A (color: red) and Dr. B (color: green) → both accept → all three dentists create appointments → WeekView shows: owner's appointments in calendar base color, Dr. A's in red, Dr. B's in green → clear visual distinction.
