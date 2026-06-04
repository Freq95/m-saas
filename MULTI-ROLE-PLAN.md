# Multi-Role Clinic System — Implementation Plan (v2.1)

> **v2 changelog:** merged review findings on (a) `AuthContext` missing `assigned_dentist_user_ids`, (b) appointment authorization living in `lib/calendar-auth.ts` not the client decoration file, (c) `/settings/team` page+API both blocking non-owners today, (d) staff fallback in JWT and admin routes, (e) DB-level single-owner enforcement, (f) services API contract for asistent CRUD on a different dentist, (g) audit helper actually named `logAdminAudit`, (h) numeric `users.id` as the id convention, (i) `users.role` as authoritative source.
>
> **v2.1 changelog:** fixed three real ship-blockers from the second technical review — services POST schema didn't validate `dentistUserId`, services PATCH/DELETE filtered by `user_id: auth.userId` (asistent writes would fail with "not found"), migration didn't pre-scan for multi-owner tenants. Added: receptionist slot-click context plumbing, service-edit audit when proxied, two-state reassign banner copy, invite-acceptance role/assignment preview, mobile team layout at 640px, in-app role-migration announcement banner. Demoted "—" empty-state placeholder to a CTA-driven empty state.

## Implementation Status (2026-05-12)

This plan has been partially implemented in the current codebase.

Completed or mostly completed:
- role enum expansion around `owner`, `dentist`, `receptionist`, and `asistent`
- `AuthContext` support for `assigned_dentist_user_ids`
- calendar visibility/authorization branches for receptionist/asistent workflows
- Settings -> Team owner edit mode plus read-only non-owner mode
- Settings -> Services per-dentist scope, assistant delegation, and receptionist read-only grouping
- appointment modal service/client scoping for selected dentist/calendar
- mobile-friendly team and services layouts
- migration/index scaffolding for role expansion

Related follow-up completed outside the original role plan:
- appointment categories are dentist-owned and live under Settings -> Calendars
- category colors apply only to own/default calendars; shared calendars keep dentist/calendar colors
- delegated service/category writes invalidate the target dentist scope where applicable

Still worth re-checking before production rollout:
- owner-facing audit-log UI for delegated service/category edits
- role-migration help page linked from any migration banner
- combined calendar view optimized for assistants assigned to multiple dentists
- automated tests for receptionist/asistent appointment CRUD and service/category delegation

Recent validation:
- `npm run typecheck`
- `npm run build`

## Context

Today the role enum is `super_admin | owner | staff`, where `staff` is a no-op label with no real permissions. The platform doesn't model the structure of a real dental clinic. This plan adds four meaningful roles (`owner | dentist | receptionist | asistent`) that fit how a clinic actually operates.

### Constraints (locked)

- **Simplest possible implementation.** No cabinets/rooms — deferred.
- **Single string role per user.** No multi-role arrays. Owner+dentist duality is implicit (active default calendar = clinical dentist).
- **Tenant has exactly one owner.** Demotion blocked in-app. Ownership transfer is a super-admin operation, documented but not built. **Enforced at DB level via partial unique index.**
- **Asistent ↔ dentist is many-to-many.** Each asistent can serve 1 or more dentists; each dentist can have 0, 1, or more asistents.
- **Receptionist visibility** = role-based intra-tenant grant; no `calendar_shares` rows written.
- **Cross-tenant calendar sharing** unchanged.
- **Identifier convention:** `assigned_dentist_user_ids: number[]` holds **numeric `users.id`** values (matches `calendars.owner_user_id`). Audit logs store `target_id: ObjectId`; do not confuse the two.
- **Source of truth for role:** `users.role` is authoritative (drives JWT). `team_members.role` mirrors it. Every write path (invite, role change, admin update, super-admin transfer) updates **both** in a single transaction or sequential awaits.

## Roles

| Role | Capabilities |
|---|---|
| **owner** | Full admin (team, settings, GDPR, clinic calendars). If their default calendar is `is_active: true`, they also operate as a dentist. One per tenant. |
| **dentist** | Own calendar, own appointments, own services. No team mgmt. No admin settings. |
| **receptionist** | Tenant-wide visibility on all calendars. Create/edit/delete appointments for any dentist. Read-only on services. No team mgmt. No access to others' inboxes. |
| **asistent** | Linked to ≥1 dentists via `assigned_dentist_user_ids`. CRUD on those dentists' appointments + services. No inbox. No team edits. |

**Owner+dentist** is implicit: owner row label = "Proprietar (medic)" when their default calendar is active, "Proprietar" otherwise. No new schema field.

## Permissions matrix

| Action | owner | dentist | receptionist | asistent |
|---|---|---|---|---|
| Team mgmt (invite / role / remove / reassign) | ✓ | — | — | — |
| Settings: Team | edit | read-only | read-only | read-only |
| Settings: Calendars (clinic-wide) | ✓ | — | — | — |
| Settings: Services | own | own | read-only | CRUD on assigned dentist(s) |
| Settings: GDPR | ✓ | — | — | — |
| Settings: Account / own Email integration | own | own | own | own |
| Inbox | ✓ | ✓ | ✓ | **blocked** |
| See all clinic calendars | ✓ | own only | ✓ | only assigned dentist(s) |
| Create appointment | ✓ | on own | for any dentist in tenant | for assigned dentist(s) |
| Edit/delete appointment | own + per-share | own + per-share | any in tenant | for assigned dentist(s) |

## AuthContext expansion

`lib/auth-helpers.ts:getAuthUser` already loads the team_members row at line 91. **Extend it** to also extract the assignment array:

```ts
// Add to AuthContext interface
assigned_dentist_user_ids?: number[];
```

In `getAuthUser`, after the membership lookup:

```ts
const assigned_dentist_user_ids =
  membership.role === 'asistent' && Array.isArray(membership.assigned_dentist_user_ids)
    ? membership.assigned_dentist_user_ids.filter((id: unknown): id is number => typeof id === 'number' && id > 0)
    : undefined;
```

Single read; no extra round trip. `users.role` continues to be authoritative for the role itself; the assignment array lives on `team_members` only (tenant-scoped).

## Visibility — server-side authorization layer

The plan's chokepoints are server-side, not the UI decoration. Three call sites:

1. **`lib/server/calendars-list.ts:getCalendarListForUser`** — what calendars do I see?
   ```ts
   if (auth.role === 'receptionist') {
     return all_active_calendars_in(auth.tenantId);
   }
   if (auth.role === 'asistent' && auth.assigned_dentist_user_ids?.length) {
     return calendars_owned_by(auth.assigned_dentist_user_ids, auth.tenantId);
   }
   // ...existing owner + share-recipient flow
   ```

2. **`lib/calendar-auth.ts:getCalendarAuth`** — can I touch this calendar? **This is the real authorization chokepoint.** Today: returns owner-perms if owner, else looks up an accepted share. Add a role branch BEFORE the share lookup:
   ```ts
   if (calendar.tenant_id.equals(authContext.tenantId)) {
     if (authContext.role === 'receptionist') {
       return { ...calendarMeta, isOwner: false, permissions: OWNER_CALENDAR_PERMISSIONS, shareId: null };
     }
     if (authContext.role === 'asistent'
         && authContext.assigned_dentist_user_ids?.includes(calendar.owner_user_id)) {
       return { ...calendarMeta, isOwner: false, permissions: OWNER_CALENDAR_PERMISSIONS, shareId: null };
     }
   }
   ```
   This grants receptionist/asistent the same permission set as the calendar owner *within their own tenant*. The cross-tenant share path (lines 189–213) is untouched.

   **Important:** `OWNER_CALENDAR_PERMISSIONS` is the *appointment* permission set (create, edit_all, delete_all). It is **not** equivalent to ownership for calendar-level destructive ops. Calendar DELETE and calendar-settings updates go through `requireCalendarOwner` (`app/api/calendars/[calendarId]/route.ts:160`) which **explicitly checks `calendarAuth.isOwner`**. Because we return `isOwner: false` for the role-branch path, receptionists/asistents cannot delete calendars or change their settings — they can only manage appointments on them. Add a code comment in `getCalendarAuth` reinforcing this contract so future maintainers don't inadvertently change it.

3. **`app/calendar/lib/appointment-access.ts`** — UI decoration only. Mirror the server logic so client `canEdit/canDelete` flags don't disagree with server checks. **No load-bearing security here** — server is the source of truth.

## Schema changes

### `team_members` collection

| Field | Today | After |
|---|---|---|
| `role` | `'owner' \| 'staff'` | `'owner' \| 'dentist' \| 'receptionist' \| 'asistent'` |
| `assigned_dentist_user_ids` | — | `number[]` (optional, only for asistents; numeric `users.id`) |

### `users` collection
- `role` enum updated identically. Authoritative for JWT.

### Indexes

Add a partial unique index to `migrations/004_role_expansion.js` to enforce **exactly one owner per tenant** at the DB level:

```js
db.collection('team_members').createIndex(
  { tenant_id: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'owner', status: 'active' },
    name: 'unique_active_owner_per_tenant',
  }
);
```

Concurrent updates that would create a second owner fail with E11000. The role-change handler treats this as "owner already exists; transfer required."

### Migration script: `scripts/migrate-roles.ts`

Idempotent. Run once on deploy. **Pre-checks first** so the index creation never throws on dirty data:

```ts
// 1. PRE-CHECK: bail if any tenant currently has 2+ active owners.
//    Index creation would E11000 otherwise; surfacing this gracefully is better than a partial migration.
const multiOwners = await db.collection('team_members').aggregate([
  { $match: { role: 'owner', status: 'active' } },
  { $group: { _id: '$tenant_id', count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
]).toArray();
if (multiOwners.length > 0) {
  console.error('[migrate-roles] ABORTING: tenants with 2+ active owners must be resolved first:',
    multiOwners.map(t => ({ tenantId: String(t._id), ownerCount: t.count })));
  process.exit(1);
}

// 2. staff → dentist
await db.collection('users').updateMany({ role: 'staff' }, { $set: { role: 'dentist' } });
await db.collection('team_members').updateMany({ role: 'staff' }, { $set: { role: 'dentist' } });

// 3. invite_tokens with role='staff' (still pending) → dentist
await db.collection('invite_tokens').updateMany({ role: 'staff' }, { $set: { role: 'dentist' } });

// 4. create unique partial index — pre-check ensures no E11000
await db.collection('team_members').createIndex(
  { tenant_id: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'owner', status: 'active' },
    name: 'unique_active_owner_per_tenant',
  }
);

// 5. soft assertion: log tenants with 0 active owners (data integrity, not blocking)
const ownerless = await db.collection('tenants').aggregate([
  { $lookup: { from: 'team_members', localField: '_id', foreignField: 'tenant_id', as: 'tm' } },
  { $addFields: { activeOwners: { $filter: { input: '$tm', cond: { $and: [{ $eq: ['$$this.role', 'owner'] }, { $eq: ['$$this.status', 'active'] }] } } } } },
  { $match: { 'activeOwners.0': { $exists: false } } },
  { $project: { _id: 1, name: 1 } },
]).toArray();
if (ownerless.length) console.warn('[migrate-roles] tenants without active owner:', ownerless);
```

**Idempotency:** Re-running is safe. `updateMany` no-ops on already-migrated rows. `createIndex` with the same name is idempotent (returns existing index meta).

## Cleanup of remaining `staff` entry points

The agent flagged three live sources where `'staff'` could be reintroduced post-migration. All updated:

| File:line | Change |
|---|---|
| `lib/auth.config.ts:25, 35` | JWT fallback `'staff'` → `'dentist'`. Sessions for users created without an explicit role default to dentist. |
| `app/api/admin/users/[id]/route.ts:81` | Allowed roles list updated to `['super_admin', 'owner', 'dentist', 'receptionist', 'asistent']`. |
| `app/api/admin/tenants/[id]/users/route.ts:77` | Default role on admin-driven user creation changed from `'staff'` to `'dentist'`. Validation list expanded. |

Plus a sweep across tests/seed scripts:

| File | Change |
|---|---|
| Any `tests/**/*.test.ts*` referencing `'staff'` | Update to one of the new roles. |
| Any `scripts/seed*` or fixtures | Update. |
| Type definitions referencing `UserRole` | Update at the type level (TypeScript will fail-fast on the rest). |

## `/settings/team` — explicit changes for read-only non-owner access

Today's behavior:
- `app/settings/team/page.tsx:26` redirects non-owners to `/settings/services`.
- `app/api/team/route.ts:9` returns 403 for non-owners.

After:

| Surface | Owner | Dentist / Receptionist / Asistent |
|---|---|---|
| Page render (`page.tsx`) | full UI (selects, remove buttons, invite) | grouped layout, **read-only** (no buttons/selects) |
| GET `/api/team` | full member rows | filtered rows: `name`, `role`, `assigned_dentist_user_ids` only — **no email, no status** (privacy-safe) |
| POST `/api/team/invite` | allowed | 403 |
| PATCH `/api/team/[memberId]` | allowed | 403 |
| DELETE `/api/team/[memberId]` | allowed | 403 |

Add a `viewMode: 'edit' | 'readonly'` flag to the page client based on `auth.role === 'owner'`. The API filters response shape based on caller's role.

## UI: Settings → Team — grouped layout

```
PROPRIETAR
  Dr. Maria Ionescu (proprietar · medic)        [role select disabled] [×]

MEDICI
  Dr. Alexandru Popescu (medic)                  [role select] [×]
    └ Andrea P. (asistent)                       [role select] [assignments] [×]
    └ Bianca M. (asistent)                       [role select] [assignments] [×]
  Dr. Ioana Marinescu (medic)                    [role select] [×]

RECEPTIONERI
  Andrei R.                                      [role select] [×]

ASISTENȚI MULTIPLI
  Cosmin V. — asistă: Dr. Popescu, Dr. Marinescu  [role select] [assignments] [×]
```

Layout rules (apply in both edit and read-only):
- **Empty sections are hidden, not "—"-placeholdered.** A brand-new clinic with only the owner shows the `PROPRIETAR` row plus a single CTA below: *"Echipa ta este momentan doar proprietarul. [+ Invită medic] [+ Invită recepționer]"*. Sections appear as members are added. (This replaces the v2 `—` placeholder rule, which felt like incomplete state to first-time users.)
- An asistent serving exactly 1 dentist appears nested under that dentist.
- An asistent serving 2+ dentists appears in **ASISTENȚI MULTIPLI**.
- Multiple asistents under one dentist render as multiple `└` rows in stable order.

### Mobile (≤640 px) layout
The grouped layout collapses for the standardized mobile breakpoint:
- Section headers (`PROPRIETAR`, `MEDICI`, etc.) become full-width, denser.
- Each member row becomes a card with name on top, role badge + assignment chips below, and a single overflow-menu (`⋯`) on the right.
- Inline `<select>` is replaced with a bottom-sheet picker on tap (existing modal/sheet primitives in this project).
- Multi-select assignments open as a separate sheet from the overflow menu.

Edit-mode interactions (owner only):
- Inline `<select>` for role with **5-second undo toast** ("Andrea schimbată în Receptionistă · Anulează").
- Selecting `asistent` reveals a multi-select for `assigned_dentist_user_ids`. Same undo toast.
- Owner row's role `<select>` is rendered disabled.
- "Invită" button at top opens the invite modal (role + assignments if asistent).

## UI: AppointmentModal — dentist field per role

| Role | Behavior |
|---|---|
| owner / dentist | Default = currently-viewed calendar's owner. Same as today. |
| receptionist (single-calendar view) | Default = that calendar's owner. |
| receptionist (all-calendars view) | Default = the dentist whose **column the slot was clicked in**. If the click had no column context (e.g. day-view list, FAB button), default empty and require a pick from a dropdown of all tenant dentists. |
| asistent (1 dentist) | Field locked, dropdown hidden. Shows "Pentru Dr. X". |
| asistent (2+ dentists) | Dropdown limited to assigned dentists. Required pick. |

**Implementation note:** `handleSlotClick` in `app/calendar/CalendarPageClient.tsx` currently receives `(day, hour, minute)` only — no calendar/dentist identity. To make receptionist slot-clicks auto-fill the dentist, the slot click handler in the all-calendars `WeekView`/`DayPanel` needs to **thread the column's `calendar_id` and resolve it to `owner_user_id`** before opening the modal. The modal then receives an optional `defaultDentistUserId` prop. Without this plumbing, a receptionist who clicks Dr. Popescu's 10am slot will see an empty dentist field — confusing UX.

## UI: Settings → Services — per-dentist scope

Schema already supports this (`services.user_id`). API + UI changes:

### API contract changes

`app/api/services/route.ts` and `app/api/services/[id]/route.ts`:

| Endpoint | Today | After |
|---|---|---|
| GET `/api/services?dentistUserId=N` | already works (line 36) | no change |
| POST `/api/services` (body, optional `dentistUserId`) | always uses `auth.userId` (line 89) | if `dentistUserId` provided, validate caller has CRUD rights for that dentist (asistent assigned, or owner of same tenant); else use `auth.userId`. |
| PATCH `/api/services/[id]` | filters by `user_id: auth.userId` (line 78) — **breaks for asistents** | drop the `user_id` filter; resolve service first by `id` only, then run permission check on `service.user_id`. |
| DELETE `/api/services/[id]` | same | same |

CRUD-rights check helper (new in `lib/services-permissions.ts`):

```ts
function canCrudServicesFor(auth: AuthContext, targetUserId: number): boolean {
  if (auth.userId === targetUserId) return true;
  if (auth.role === 'owner') return true; // owners can manage any clinic dentist's services
  if (auth.role === 'asistent' && auth.assigned_dentist_user_ids?.includes(targetUserId)) return true;
  return false;
}
```

**Validation schema update** — `lib/validation.ts:createServiceSchema` does not currently accept `dentistUserId`; the body parser would silently drop it. Extend the schema:

```ts
// in createServiceSchema:
dentistUserId: z.number().int().positive().optional(),
```

Apply the same to any "update service" schema if a separate one exists. Without this, the POST handler can never observe the field.

**PATCH/DELETE handler shape** — pseudocode for the new flow:

```ts
const service = await db.collection('services').findOne({ id: serviceId, tenant_id: auth.tenantId });
if (!service) return notFound();
if (!canCrudServicesFor(auth, service.user_id)) return forbidden();
// proceed with update/delete
```

The previous `findOne({ id, user_id })` shape gives a misleading 404 to legitimate asistent edits — this is the v2.1 fix.

**Cache invalidation** — when `targetUserId !== auth.userId`, invalidate the target dentist's caches by passing `additionalScopes` to the existing `invalidateReadCaches` helper in `lib/cache-keys.ts`:

```ts
await invalidateReadCaches({
  tenantId: auth.tenantId,
  userId: auth.userId,
  additionalScopes: targetUserId !== auth.userId
    ? [{ tenantId: auth.tenantId, userId: targetUserId }]
    : undefined,
});
```

This invalidates services list, dashboard, appointments — every cache keyed on the target dentist's scope.

**Audit on proxied edits** — when `service.user_id !== auth.userId` (asistent or owner editing on someone else's behalf), call `logAdminAudit` with `action: 'service.edit_by_proxy'`, `targetType: 'service'`, `targetId: ObjectId(service._id)`, before/after. Provides the dentist a trail when their catalog changes without their action.

### UI changes

| Role | View |
|---|---|
| owner / dentist | CRUD on own (today's behavior). |
| asistent (1 dentist) | CRUD on that dentist's services. Banner: "Editezi serviciile lui Dr. X." |
| asistent (2+ dentists) | Top selector "Pentru care medic gestionezi?" → CRUD scoped to selected dentist. |
| receptionist | Read-only grouped list of all dentists' services. |

## UI: Inbox — asistent block

`/inbox` adds a role guard. If `auth.role === 'asistent'` → redirect to `/calendar` with toast. Future config (`team_members.inbox_visible_to_asistent: boolean`) deferred. **Also block** any inbox-derived API surface (`/api/conversations*`, `/api/messages*`) for asistents to prevent UI-only enforcement.

## UI: Landing page after login

Per role, in `app/(main)/layout.tsx` or a dedicated middleware:
- owner / receptionist → `/dashboard`
- dentist → `/calendar` (their own)
- asistent → `/calendar` (first assigned dentist's calendar via `assigned_dentist_user_ids[0]`)
- asistent with empty assignments → `/calendar` rendering a **reassign banner** (new component, see below)

## New UI components

### Reassign banner (`<AsistentReassignBanner />`)
No existing pattern. Lives in `app/calendar/components/AsistentReassignBanner.tsx`. Hides the calendar grid behind it. **Two states with distinct copy** — same component, different message based on input:

| Trigger | Copy |
|---|---|
| `assigned_dentist_user_ids` empty (post-invite, owner hasn't assigned yet) | **Așteaptă asignarea.** Ești invitat ca asistent, dar proprietarul clinicii nu te-a asignat încă unui medic. Vei primi o notificare când e gata. |
| Array non-empty but all assigned dentists have inactive calendars | **Așteaptă o reasignare.** Niciunul dintre medicii cărora le ești asistent nu are calendar activ. Proprietarul te va reasigna în curând. |

Distinguishing the two prevents a freshly-invited asistent from reading a message about "inactive doctors" when really they just haven't been assigned to anyone yet.

### Role-migration announcement (`<RoleMigrationBanner />`)
One-time, dismissible banner shown for 7 days post-deploy on `/calendar` and `/settings/team`. Explains the role expansion to existing users (most importantly: ex-`staff` users who suddenly have new permissions). Stored dismissal in `localStorage` keyed by user id + a deploy-version constant. Copy:

> **Roluri actualizate.** Clinica ta are acum patru roluri: Proprietar, Medic, Recepționer, Asistent. Vezi [ce s-a schimbat](/help/roles-update) sau verifică echipa în Setări → Echipă.

Without this, ex-staff users open the app and notice their permissions changed without explanation. (`/help/roles-update` is a static page deferred from this plan; for v2.1, the link can point to a placeholder or an external help doc.)

### Undo toast for role changes
Reuses existing `useToast()` infra in `lib/useToast.ts` plus a new `<UndoToast />` variant that runs a 5-second timer with a Cancel button. On timeout, the change is committed (already-fired API call); on cancel, the API call is reversed.

## Edge cases & rules

| Case | Rule |
|---|---|
| Remove a dentist who has linked asistent(s) | Block. Modal: "Asistenții X, Y sunt asignați. Dezleagă-i întâi." Two buttons: "Mergi la rolul lor" (jumps to first asistent's row) and "Anulează". |
| Change a dentist's role away from `dentist` while asistents are linked | Same block. |
| Remove an asistent who has `assigned_dentist_user_ids` set | Block. Modal: "Acest asistent este încă asignat. Dezleagă-l întâi." |
| Strip a dentist from an asistent's array | Allowed. If array becomes empty, asistent shows reassign banner on next page load. |
| Demote owner via UI | Disabled `<select>`. API rejects with 403 ("Owner role cannot be changed in-app"). |
| Owner deactivates own calendar | UI label drops "(medic)". Owner removed from dentist dropdowns. Existing appointments stay. |
| Receptionist + cross-tenant shares received by a colleague-dentist | Receptionist does NOT see those. Role-grant is intra-tenant only. |
| Bookable dentists on a specific calendar | Unchanged: calendar's owner + cross-tenant shares with `can_create`. Receptionist seeing a colleague's calendar does NOT make that colleague bookable on it. |
| Invite asistent without selecting any dentist | Block submit with inline error. |
| Owner is invited via super-admin tenant creation but never sets a calendar | Owner row labeled "Proprietar" (no `(medic)`). Receptionist appointment dropdown skips them. |
| Concurrent edit by 2 asistents on same dentist's appointment | Last-write-wins (today's behavior). No locking added. Acceptable. |
| Pending invite tokens with old `staff` role at deploy time | Migration script updates `invite_tokens.role` too. |

## Audit logging

Use existing `lib/audit.ts:logAdminAudit` (NOT `logAuditEntry`). Three new actions:

| Action | Triggered by | Target | Captures |
|---|---|---|---|
| `team.role_change` | Owner changes a member's role via Team UI | user (ObjectId) | before/after role |
| `team.asistent_assignment` | Owner adds/removes assigned dentists for an asistent | user (ObjectId) | before/after array |
| `service.edit_by_proxy` | Asistent or owner edits a service whose `user_id !== auth.userId` | service (ObjectId) | before/after price/duration/name |

The third one is the **important addition for v2.1**: when an asistent edits Dr. Popescu's prices, Dr. Popescu has a trail showing who changed what and when. Without this, a dentist would discover their service catalog changed with no record of who did it.

```ts
await logAdminAudit({
  action: 'team.role_change' | 'team.asistent_assignment' | 'service.edit_by_proxy',
  actorUserId: auth.dbUserId,
  actorEmail: auth.email,
  targetType: 'user' | 'service',
  targetId: target._id, // ObjectId
  before: { /* shape depends on action */ },
  after: { /* shape depends on action */ },
  request,
});
```

No schema changes to `audit_logs`.

## Files to modify

### Schema / auth (server-side authorization)
- `lib/auth-helpers.ts` — update `UserRole` enum; extend `AuthContext` with `assigned_dentist_user_ids`; populate from `team_members` lookup.
- `lib/auth.config.ts` — change `'staff'` fallback to `'dentist'` in JWT + session callbacks.
- `lib/calendar-auth.ts` — add role branch in `getCalendarAuth` for receptionist/asistent intra-tenant grant. **(Critical chokepoint.)**
- `lib/server/calendars-list.ts` — role branch in `getCalendarListForUser`.
- `lib/calendar-dentists.ts` — no change to `resolveBookableDentistForCalendar` semantics.
- `app/calendar/lib/appointment-access.ts` — mirror server logic for client `canEdit/canDelete` decoration.

### API
- `app/api/team/route.ts` — relax owner-only to allow read for all tenant members; filter response shape by caller role.
- `app/api/team/invite/route.ts` — accept `role` (validated against new enum) + optional `assigned_dentist_user_ids`. Owner-only.
- `app/api/team/[memberId]/route.ts` — add PATCH for role change + reassignment. Reject changes on owner. Reject removal/role-change while asistent links exist. Owner-only.
- `app/api/admin/users/[id]/route.ts:81` — update allowed roles list.
- `app/api/admin/tenants/[id]/users/route.ts:77` — default role `'dentist'`; expanded enum.
- `app/api/services/route.ts`, `app/api/services/[id]/route.ts` — accept `dentistUserId` on POST; resolve target on PATCH/DELETE; gate via `canCrudServicesFor`. Cache invalidation for target dentist when delegated.
- `app/api/appointments/route.ts`, `app/api/appointments/[id]/route.ts` — server-side authorization derives from `getCalendarAuth` (already does), so role grants flow naturally through the new branch.
- `/inbox` page guard + `/api/conversations*` and `/api/messages*` route guards — block asistent.

### UI
- `app/settings/team/page.tsx` — drop redirect for non-owners.
- `app/settings/team/TeamSettingsPageClient.tsx` — grouped layout, role `<select>`, asistent multi-select, undo toast, read-only mode for non-owners, mobile (≤640 px) collapsed-card layout.
- `app/settings/services/ServicesSettingsPageClient.tsx` — dentist-aware (asistent picker, receptionist read-only grouped view). Service writes pass `dentistUserId` when delegating.
- `app/calendar/components/modals/AppointmentModal/*` — dentist field per role; accept `defaultDentistUserId` prop.
- `app/calendar/CalendarPageClient.tsx` — landing logic + reassign banner injection for asistent. Slot click handlers thread `calendar.owner_user_id` so all-calendars-view receptionist clicks auto-fill the dentist.
- `app/calendar/components/WeekView/WeekView.tsx` and `app/calendar/components/DayPanel/DayPanel.tsx` — pass column's calendar identity into the slot-click callback.
- `app/calendar/components/AsistentReassignBanner.tsx` — new component, two-state copy.
- `app/calendar/components/RoleMigrationBanner.tsx` — new one-time announcement banner.
- `app/inbox/page.tsx` — asistent guard with toast redirect.
- `app/invite/[token]/page.tsx` (or invite-acceptance client) — preview the invitee's role and assigned dentist names before they confirm. Copy: *"Ești invitat ca asistent al Dr. Popescu și Dr. Marinescu."*
- `app/(main)/layout.tsx` or middleware — landing-page redirect per role; inject `RoleMigrationBanner` for 7 days post-deploy.

### Migration
- `scripts/migrate-roles.ts` — staff → dentist on `users`, `team_members`, `invite_tokens`; create unique partial index; orphaned-tenant assertion.
- `migrations/004_role_expansion.js` — declarative form of the index for fresh installs.

### Reused utilities (do not rewrite)
- `getAuthUser()` in `lib/auth-helpers.ts` — extended, not replaced.
- `getCalendarAuth()` in `lib/calendar-auth.ts` — extended, not replaced.
- Audit logging via `lib/audit.ts:logAdminAudit`.
- Existing AppointmentModal dentist dropdown wiring.
- `useToast()` in `lib/useToast.ts`.

## Verification

1. **Migration dry-run**: run `scripts/migrate-roles.ts` against a fresh dev clone of prod. Assert (a) all `staff` rows updated, (b) unique-owner index created, (c) zero E11000 errors on existing data, (d) ownerless-tenant log is empty.
2. **AuthContext sanity**: log in as an asistent → confirm `auth.assigned_dentist_user_ids` is populated. Log in as a non-asistent → confirm field is `undefined` (not empty array).
3. **`getCalendarAuth` branch**:
   - Receptionist calling `getCalendarAuth(tenant_calendar_id)` → returns `OWNER_CALENDAR_PERMISSIONS`, `isOwner: false`.
   - Receptionist calling `getCalendarAuth(other_tenant_calendar_id)` → 403.
   - Asistent calling `getCalendarAuth(assigned_dentist_calendar_id)` → owner-equivalent perms.
   - Asistent calling `getCalendarAuth(unassigned_dentist_calendar_id)` → 403.
4. **Owner+dentist**: owner with active calendar → appears in dentist dropdowns. Deactivate calendar → label drops "(medic)"; absent from dropdowns.
5. **Receptionist e2e**: see all calendars; create appt for any dentist; `/settings/team` read-only; `/settings/services` read-only; `/inbox` accessible; cross-tenant shares to colleagues NOT visible.
6. **Asistent (1 dentist)**: lands on assigned dentist's calendar; appointment modal locks dentist; services UI scoped; inbox redirects with toast; team UI read-only with self nested.
7. **Asistent (2+ dentists)**: lands on first dentist's calendar; appointment modal shows 2-option dropdown; services UI shows picker; team UI under **ASISTENȚI MULTIPLI**.
8. **Multi-asistent dentist**: 2 asistents under one dentist visible in team list; both can independently CRUD services; concurrent edit on same appt = last-write-wins (no error).
9. **Block flows**:
   - Remove dentist with asistent → blocked, modal jumps to asistent row.
   - Change dentist→receptionist while asistents linked → same block.
   - Remove asistent still linked → blocked.
   - Manually crafted PATCH to demote owner → 403.
   - DB-level: try to insert second `team_members` row with `role: 'owner', status: 'active'` for same tenant → E11000.
   - Asistent has all dentists deactivated → reassign banner appears.
10. **Service API contract**:
    - Asistent POSTs `/api/services` with `dentistUserId=X` (their assigned dentist) → success; service stored under X's user_id; X's services + dashboard caches invalidated via `additionalScopes`.
    - Asistent POSTs with `dentistUserId=Y` (not assigned) → 403.
    - Asistent PATCHes a service owned by their assigned dentist → success (was failing in v2 because the handler filtered `user_id: auth.userId`).
    - Asistent PATCHes a service owned by a non-assigned dentist → 403 (not 404, even if the service technically exists).
    - Receptionist POSTs anywhere → 403.
    - Body `dentistUserId` is rejected when not in the validation schema → confirms `createServiceSchema` was extended.
11. **Receptionist slot-click**: receptionist on all-calendars view clicks 10 am slot in Dr. Popescu's column → AppointmentModal opens with dentist field auto-filled to Popescu, **not empty**.
12. **Audit**: change a role + reassign + asistent edits a delegated service → three `audit_logs` rows with `team.role_change`, `team.asistent_assignment`, `service.edit_by_proxy`. The dentist whose catalog was edited can later see the proxy change in their audit trail (via super-admin tooling for now; owner-facing UI deferred).
13. **Migration pre-check**: seed a tenant with 2 active owners, run `migrate-roles.ts` → script aborts with the offending tenant ids logged. Fix the tenant, re-run → migration completes.
14. **Reassign banner copy**: invite asistent without assignments → see "Așteaptă asignarea." Assign 1 dentist, deactivate that dentist's calendar → see "Așteaptă o reasignare."
15. **Mobile team layout** at 640 px: open `/settings/team` on a phone → grouped sections render as cards, role change opens a bottom sheet, multi-select assignments open a separate sheet.
16. **Role-migration banner**: existing user logs in post-deploy → sees the banner once. Dismiss → never shown again. New user (created post-deploy) → never sees it.
17. **`npm run build && npx tsc --noEmit`** clean.

## Out of scope (explicitly deferred)

- Cabinets / rooms / chairs.
- Configurable inbox sharing (per-dentist toggle to grant asistent access).
- Multi-role per user (e.g., owner+receptionist combo).
- Owner role transfer in-app (super-admin script handles for now).
- Notifications when role changes.
- Per-dentist different service prices — already supported by schema; UI changes covered here.
- Dentist auto-becoming bookable on colleagues' calendars within the same tenant — kept opt-in via existing `calendar_shares`.
- Owner-facing audit-log UI (`/admin/audit` exists for super-admins; owner-facing trail is a future feature). Until built, dentists who want to know who changed their service catalog rely on the super-admin querying the audit log.
- **Combined-view calendar for multi-dentist asistents.** v2.1 still defaults to the first assigned dentist's calendar. A "see all my dentists overlaid in different colors" view is a real workflow improvement but adds significant complexity (color attribution, bookable-dentist resolution per slot). Recommend not pairing one asistent with 2+ dentists in production until this is built.
- **Receptionist services search.** With ~3 dentists × 30 services = ~90 rows, the read-only grouped list is fine. Search/filter is a small follow-up if it becomes a pain point.
- **Receptionist email-visibility policy.** v2.1 hides emails from non-owners on the team list. If clinic owners report this as friction (small clinics where everyone knows each other), revisit and surface emails to all team members.
- **Reminder/notification reply-to semantics** when a receptionist creates an appointment. Today reminders are clinic-branded; this isn't worsened by the new roles. Worth pinning down before the scheduling-reminders feature ships.
- **`/help/roles-update` static page.** The migration banner links to it; for v2.1 the link can be a placeholder or external doc. Build the page when there's bandwidth.

## Open questions — resolved

| Question | Resolution |
|---|---|
| Should role be authoritative from `users` or `team_members`? | **`users.role` is authoritative** (drives JWT). `team_members.role` mirrors it. All write paths update both atomically. |
| Are assistants assigned by numeric `users.id` or Mongo `_id`? | **Numeric `users.id`** — matches `calendars.owner_user_id`. Audit logs separately store `target_id: ObjectId`; the two are not interchangeable, but each has a clear convention. |

## Risks / open watchpoints (not blocking)

- The DB-level unique-owner index assumes `status: 'active'`. If the team_members.status flow ever drifts (e.g., a "transferring" intermediate status), revisit.
- The receptionist "see all tenant calendars" may include calendars the owner created for now-departed dentists. UI should probably filter inactive calendars. Out of scope for this iteration.
- Asistent gaining CRUD rights on another dentist's services is a privilege the dentist may not expect by default. The plan trusts that the owner sets up assignments deliberately. **Mitigation in v2.1:** every proxied service edit now writes to `audit_logs` (`service.edit_by_proxy`), so the dentist has a recovery path. Future enhancement: add a per-asistent permission flag (`can_edit_services`) defaulting to true, owner can disable.
- **Concurrent edits by 2+ asistents on the same dentist's appointment or service** are last-write-wins (today's behavior, unchanged). Acceptable, but should be called out in clinic onboarding so owners avoid pairing two asistents tightly on the same workflow.
- **Operational training:** owners must understand that asistents can change prices. Document this in onboarding so the assignment isn't made casually.
