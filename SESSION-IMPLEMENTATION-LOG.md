# Session Implementation Log

Created: 2026-02-19
Scope: Auth + super-admin + invite flow + audit + tenant/user lifecycle controls

## 1) Authentication and Session
- Added NextAuth v5 credentials flow in `lib/auth.ts`.
- Added type extensions in `types/next-auth.d.ts`.
- Added auth route `app/api/auth/[...nextauth]/route.ts`.
- Added `AuthSessionProvider` wrapper in `components/AuthSessionProvider.tsx`.
- Added route chrome handling in `components/AppChrome.tsx`.
- Wrapped root layout with session provider in `app/layout.tsx`.
- Added login + invite pages:
  - `app/(auth)/login/page.tsx`
  - `app/(auth)/login/LoginForm.tsx`
  - `app/(auth)/invite/[token]/page.tsx`

## 2) Auth Guards and Helpers
- Added `lib/auth-helpers.ts`:
  - `getAuthUser()`, `getSuperAdmin()`, `requireRole()`, `AuthError`.
- Enforced DB-backed effective access checks for tenant users:
  - user active
  - tenant active
  - membership active
- Enforced super-admin account active + role checks.

## 3) Middleware Protection
- Reworked `middleware.ts` to:
  - allow public routes (`/login`, `/invite/*`, auth/invite/webhook paths)
  - protect admin routes with super-admin role
  - require tenant context for tenant routes
  - keep rate-limiting behavior

## 4) Invite and Email
- Added invite token system in `lib/invite.ts`:
  - create / validate / mark-used
  - TTL and lookup indexes
  - invite email generation
- Added email wrapper in `lib/email.ts` with graceful fallback if `RESEND_API_KEY` missing.
- Added invite API `app/api/invite/[token]/route.ts` for validate + set-password.

## 5) Super-Admin and Admin Surface
- Added super-admin script:
  - `scripts/create-super-admin.ts`
  - package script `admin:create`
- Added admin pages:
  - `/admin`
  - `/admin/tenants`
  - `/admin/tenants/new`
  - `/admin/tenants/[id]`
  - `/admin/users`
  - `/admin/users/[id]`
  - `/admin/audit`
  - `/admin/docs`
- Added admin APIs:
  - `app/api/admin/stats/route.ts`
  - `app/api/admin/audit/route.ts`
  - `app/api/admin/tenants/...`
  - `app/api/admin/users/[id]/route.ts`
  - `app/api/admin/users/[id]/restore/route.ts`

## 6) DEFAULT_USER_ID Removal and Session Adoption
- Removed `DEFAULT_USER_ID` from constants.
- Removed `.default(1)` user defaults in validation.
- Refactored listed routes/pages to derive identity from session/auth helpers.
- Updated affected server/client pages (`dashboard`, `calendar`, `inbox`, `settings/email`) and APIs.

## 7) Audit Logging
- Added `lib/audit.ts` and indexes for `audit_logs`.
- Logged admin actions:
  - tenant create/update/suspend/soft_delete/restore
  - tenant user add/invite resend
  - user update/soft_delete/restore
- Captured actor, target, IP/UA, before/after, metadata reason.

## 8) Soft Delete + Restore (Enterprise Style, No Hard Delete)
- Tenant soft delete:
  - status -> `deleted`
  - set `deleted_at`, `deleted_by`
  - reason required
  - cascade users/memberships disabled
- Tenant restore:
  - status -> `active`
  - clear delete fields
  - reason required
  - restore only entries marked `disabled_by_tenant`
- User soft delete:
  - status -> `deleted`
  - set `deleted_at`, `deleted_by`
  - reason required
  - memberships -> `revoked`
- User restore:
  - status -> `active`
  - clear delete fields
  - reason required
  - memberships -> `active`
- Safety rule:
  - cannot remove/deactivate last active `super_admin`.

## 9) UI and Operational Clarity
- Added logout button in settings page:
  - `app/settings/email/EmailSettingsPageClient.tsx`
- Improved user list visibility:
  - show tenant status beside tenant and membership labels.
- Added admin docs page (`/admin/docs`) with compact transition matrix.

## 10) Environment and Script Reliability
- Updated `.env.example` with auth/email keys.
- Ensured `admin:create` can read env by adding `import 'dotenv/config'`.

## 11) Build / Typecheck Status
- `npx tsc --noEmit` passed.
- `npm run build` currently blocked in this environment by Windows file lock/permission on `.next-build/trace` (EPERM). Code compiles under TypeScript.

## Notes for Review
- Hard delete is intentionally excluded.
- Restore has no SLA cutoff (can restore anytime).
- Transition reasons are now required in API and prompted in admin UI for destructive transitions.

## 12) Phase 1 Review Fix Batch (Conditional Pass -> Targeted Fixes)
- Fixed remaining hardcoded identity fallbacks called out in review:
  - `app/api/yahoo/sync/route.ts` now uses `getAuthUser()` (GET and POST).
  - `app/api/yahoo/send/route.ts` now uses `getAuthUser()` (POST).
  - `app/calendar/hooks/useResources.ts`, `app/calendar/hooks/useProviders.ts`, `app/calendar/hooks/useBlockedTimes.ts`, `app/calendar/hooks/useAppointmentsSWR.ts` now derive user ID from session when not explicitly provided (no `= 1` defaults).
- Fixed invite token race condition:
  - `lib/invite.ts` `markInviteUsed()` now atomically updates only when `used_at: null` and `expires_at > now`, and throws on `modifiedCount = 0`.
  - `app/api/invite/[token]/route.ts` now handles consumed/expired token with explicit `409`.
- Hardened dual user-id parsing:
  - `lib/auth-helpers.ts` now validates session `user.id` with strict numeric format and round-trip check before parse.
- Added unique index for tenant slug:
  - `app/api/admin/tenants/route.ts` ensures `tenants.slug` unique index.
- Fixed silent email success behavior:
  - `lib/email.ts` now returns structured send result (`ok`/`reason`) instead of `null`.
  - Invite callers now surface `inviteEmail` status in API responses and audit metadata:
    - `app/api/admin/tenants/route.ts`
    - `app/api/admin/tenants/[id]/users/route.ts`
    - `app/api/admin/tenants/[id]/resend-invite/route.ts`
  - Admin UI now shows clear notices when invite email was not sent:
  - `app/(admin)/admin/tenants/new/CreateTenantForm.tsx`
  - `app/(admin)/admin/tenants/[id]/TenantDetailClient.tsx`

## 13) Phase 2 Multi-Tenancy + Role Enforcement (2026-02-20)
- Implemented row-level tenant isolation across tenant-scoped APIs and server helpers.
- Added and wired migration/index scripts:
  - `scripts/migrate-add-tenant-id.ts`
  - `scripts/create-tenant-indexes.ts`
  - `package.json` scripts: `db:migrate:tenant`, `db:indexes`
- Updated base migration to include tenancy collections/indexes from Phase 1:
  - `migrations/001_init_mongodb.js` now includes `tenants`, `team_members`, `invite_tokens`.
- Added team management APIs for MVP role rules:
  - `app/api/team/invite/route.ts` (owner-only invite, hardcoded `staff`, seat-limit check)
  - `app/api/team/route.ts` (owner-only team list + seat usage)
  - `app/api/team/[memberId]/route.ts` (owner-only remove; cannot remove self/owner; soft remove)
- Enforced owner-only clinic settings/team access for staff:
  - Email integration settings endpoints now require owner role.
- Added tenant scoping to affected runtime paths, including:
  - appointments, blocked-times, calendar slots
  - clients and nested files/notes/history/activities/export
  - conversations and nested messages/read/attachments/images/suggest-response
  - services, tasks, reminders, providers, resources, waitlist
  - dashboard server queries
  - invite token finalize flow
  - yahoo sync and webhook email ingest paths
- Shared helper updates to propagate `tenantId` filtering:
  - `lib/calendar.ts`, `lib/calendar-conflicts.ts`, `lib/client-matching.ts`
  - `lib/server/calendar.ts`, `lib/server/clients.ts`, `lib/server/client-profile.ts`
  - `lib/server/dashboard.ts`, `lib/server/inbox.ts`
  - `lib/email-integrations.ts`, `lib/yahoo-mail.ts`, `lib/reminders.ts`

### Verification Completed
- Build and typecheck:
  - `npm run typecheck` passed
  - `npm run build` passed
- DB migration executed successfully (`npm run db:migrate:tenant`) with backfill counts confirmed.
- Index creation executed and verified:
  - `email_integrations` has unique `tenant_id_1_provider_1`
  - legacy `user_id_1_provider_1` unique index removed
- Tenant-id backfill check:
  - `appointments`, `clients`, `conversations`, `messages`, `services`, `tasks`, `email_integrations`, `client_files` all show `missing tenant_id = 0`
- Smoke tests:
  - `scripts/smoke-tenant-isolation.ts` passed:
    - Tenant A created client, Tenant B list did not leak, Tenant B direct GET returned 404
  - `scripts/smoke-role-access.ts` passed:
    - staff invite 403, team list 403, settings/email-integrations 403

## 14) Phase 2 Post-Review Fixes (2026-02-20)
- Fixed invite acceptance after membership removal:
  - `app/api/invite/[token]/route.ts`
  - Added explicit guard for `existingMember.status === 'removed'` returning `409`.
- Fixed seat allocation guard for owner invite flow:
  - `app/api/team/invite/route.ts`
  - Added `maxSeats <= 0` check returning `403` ("no seat allocation"), then normal `activeMembers >= maxSeats` enforcement.
- Updated initial Mongo migration indexes to tenant-first strategy and expanded coverage:
  - `migrations/001_init_mongodb.js`
  - Added missing collections/indexes for: `providers`, `resources`, `blocked_times`, `waitlist`, `message_attachments`, `audit_logs`.
  - Converted tenant-scoped indexes to lead with `tenant_id`.
  - Updated `email_integrations` unique index to `{ tenant_id: 1, provider: 1 }`.
  - Updated `team_members` email index to tenant-scoped `{ tenant_id: 1, email: 1 }`.
- Added legacy index cleanup in tenant index script:
  - `scripts/create-tenant-indexes.ts`
  - Drops `email_integrations.user_id_1_provider_1` if present.

### Post-Review Validation
- `npm run typecheck` passed.
- `npm run build` passed.
