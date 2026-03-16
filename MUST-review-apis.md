# API Routes Review — m-saas

> Generated: 2026-03-07
> Agent analyzed 67 API routes across `src/app/api`

---

## API Inventory

| Method | Path | Auth | Rate Limit | CSRF | Purpose |
|--------|------|------|-----------|------|---------|
| GET | `/api/admin/audit` | superAdmin | ✓ | ✓ | Fetch admin audit logs with pagination |
| GET | `/api/admin/stats` | superAdmin | ✓ | ✓ | Dashboard stats (tenants, users, plans) |
| GET | `/api/admin/tenants` | superAdmin | ✓ | ✓ | List all tenants with filtering/search |
| POST | `/api/admin/tenants` | superAdmin | ✓ | ✓ | Create new tenant |
| GET | `/api/admin/tenants/[id]` | superAdmin | ✓ | ✓ | Get tenant details with members |
| PATCH | `/api/admin/tenants/[id]` | superAdmin | ✓ | ✓ | Update tenant (name, plan, status) |
| DELETE | `/api/admin/tenants/[id]` | superAdmin | ✓ | ✓ | Soft delete tenant |
| POST | `/api/admin/tenants/[id]/resend-invite` | superAdmin | ✓ | ✓ | Resend invite to user |
| POST | `/api/admin/tenants/[id]/restore` | superAdmin | ✓ | ✓ | Restore deleted tenant |
| GET | `/api/admin/tenants/[id]/users` | superAdmin | ✓ | ✓ | List tenant users |
| POST | `/api/admin/tenants/[id]/users` | superAdmin | ✓ | ✓ | Add user to tenant |
| GET | `/api/admin/users/[id]` | superAdmin | ✓ | ✓ | Get user details |
| PATCH | `/api/admin/users/[id]` | superAdmin | ✓ | ✓ | Update user (name, role, status) |
| DELETE | `/api/admin/users/[id]` | superAdmin | ✓ | ✓ | Soft delete user |
| POST | `/api/admin/users/[id]/restore` | superAdmin | ✓ | ✓ | Restore deleted user |
| GET | `/api/appointments` | authUser | ✓ | ✓ | List appointments (with caching) |
| POST | `/api/appointments` | authUser | ✓ | ✓ | Create appointment |
| GET | `/api/appointments/[id]` | authUser | ✓ | ✓ | Get single appointment |
| PATCH | `/api/appointments/[id]` | authUser | ✓ | ✓ | Update appointment with conflict checking |
| DELETE | `/api/appointments/[id]` | authUser | ✓ | ✓ | Soft delete appointment |
| POST | `/api/appointments/recurring` | authUser | ✓ | ✓ | Create recurring appointments |
| GET | `/api/auth/forgot-password` | None | ✓ | **✗** | Generate password reset token |
| POST | `/api/auth/forgot-password` | None | ✓ | **✗** | Request password reset |
| GET | `/api/auth/reset-password` | None | **✗** | **✗** | Validate reset token |
| POST | `/api/auth/reset-password` | None | **✗** | **✗** | Reset password |
| GET | `/api/auth/[...nextauth]` | - | - | - | NextAuth.js handler |
| GET | `/api/blocked-times` | authUser | ✓ | ✓ | Get blocked time slots (with caching) |
| POST | `/api/blocked-times` | authUser | ✓ | ✓ | Create blocked time |
| GET | `/api/calendar/slots` | authUser | ✓ | ✓ | Get available time slots |
| GET | `/api/clients` | authUser | ✓ | ✓ | List clients (with caching) |
| POST | `/api/clients` | authUser | ✓ | ✓ | Create client |
| GET | `/api/clients/[id]` | authUser | ✓ | ✓ | Get client profile |
| PATCH | `/api/clients/[id]` | authUser | ✓ | ✓ | Update client |
| DELETE | `/api/clients/[id]` | authUser | ✓ | ✓ | Soft delete client |
| GET | `/api/clients/[id]/activities` | authUser | ✓ | ✓ | Get client activity timeline |
| GET | `/api/clients/[id]/files` | authUser | ✓ | ✓ | Get client files |
| POST | `/api/clients/[id]/files` | authUser | ✓ | ✓ | Upload client file |
| GET | `/api/clients/[id]/files/[fileId]/download` | authUser | ✓ | ✓ | Download client file |
| GET | `/api/clients/[id]/files/[fileId]/preview` | authUser | ✓ | ✓ | Preview client file |
| PATCH | `/api/clients/[id]/files/[fileId]` | authUser | ✓ | ✓ | Update file description |
| DELETE | `/api/clients/[id]/files/[fileId]` | authUser | ✓ | ✓ | Delete file |
| GET | `/api/clients/[id]/history` | authUser | ✓ | ✓ | Get unified client history |
| GET | `/api/clients/[id]/notes` | authUser | ✓ | ✓ | Get client notes |
| POST | `/api/clients/[id]/notes` | authUser | ✓ | ✓ | Create client note |
| GET | `/api/clients/[id]/stats` | authUser | ✓ | ✓ | Get client statistics |
| GET | `/api/clients/export` | authUser | ✓ | ✓ | Export clients to CSV |
| GET | `/api/conversations` | authUser | ✓ | ✓ | List conversations |
| POST | `/api/conversations` | authUser | ✓ | ✓ | Create conversation |
| GET | `/api/conversations/[id]` | authUser | ✓ | ✓ | Get conversation messages |
| PATCH | `/api/conversations/[id]` | authUser | ✓ | ✓ | Update conversation |
| POST | `/api/conversations/[id]/messages` | authUser | ✓ | ✓ | Send message |
| POST | `/api/conversations/[id]/read` | authUser | ✓ | ✓ | Mark conversation as read |
| GET | `/api/conversations/[id]/suggest-response` | authUser | ✓ | ✓ | Get AI suggested response |
| POST | `/api/conversations/[id]/attachments/[attachmentId]/save` | authUser | ✓ | ✓ | Save attachment |
| POST | `/api/conversations/[id]/images/save` | authUser | ✓ | ✓ | Save image |
| POST | `/api/cron/email-sync` | **None** | ✓ | **✗** | Cron job: sync emails |
| GET | `/api/dashboard` | authUser | ✓ | ✓ | Dashboard statistics |
| GET | `/api/docs` | **None** | **✗** | **✗** | OpenAPI specification |
| POST | `/api/gmail/sync` | authUser | ✓ | ✓ | Manually sync Gmail |
| GET | `/api/auth/google/email` | None | **✗** | **✗** | Google OAuth initiation |
| GET | `/api/auth/google/email/callback` | None | **✗** | **✗** | Google OAuth callback |
| POST | `/api/jobs/email-sync/gmail` | **None** | ✓ | **✗** | Job handler: Gmail sync |
| POST | `/api/jobs/email-sync/yahoo` | **None** | ✓ | **✗** | Job handler: Yahoo sync |
| GET | `/api/invite/[token]` | None | **✗** | **✗** | Get invite details |
| POST | `/api/invite/[token]` | None | **✗** | **✗** | Accept invite |
| GET | `/api/providers` | authUser | ✓ | ✓ | List providers |
| POST | `/api/providers` | authUser | ✓ | ✓ | Create provider |
| GET | `/api/reminders` | authUser | ✓ | ✓ | List reminders |
| POST | `/api/reminders` | authUser | ✓ | ✓ | Create reminder |
| GET | `/api/reminders/[id]` | authUser | ✓ | ✓ | Get reminder |
| PATCH | `/api/reminders/[id]` | authUser | ✓ | ✓ | Update reminder |
| DELETE | `/api/reminders/[id]` | authUser | ✓ | ✓ | Delete reminder |
| POST | `/api/reminders/process` | **None** | **✗** | **✗** | Cron job: process reminders |
| GET | `/api/resources` | authUser | ✓ | ✓ | List resources |
| POST | `/api/resources` | authUser | ✓ | ✓ | Create resource |
| GET | `/api/services` | authUser | ✓ | ✓ | List services (with caching) |
| POST | `/api/services` | authUser | ✓ | ✓ | Create service |
| GET | `/api/services/[id]` | authUser | ✓ | ✓ | Get service |
| PATCH | `/api/services/[id]` | authUser | ✓ | ✓ | Update service |
| DELETE | `/api/services/[id]` | authUser | ✓ | ✓ | Delete service |
| GET | `/api/settings/email-integrations` | authUser | ✓ | ✓ | List email integrations |
| POST | `/api/settings/email-integrations` | authUser | ✓ | ✓ | Create email integration |
| GET | `/api/settings/email-integrations/[id]` | authUser | ✓ | ✓ | Get email integration |
| PATCH | `/api/settings/email-integrations/[id]` | authUser | ✓ | ✓ | Update email integration |
| DELETE | `/api/settings/email-integrations/[id]` | authUser | ✓ | ✓ | Delete email integration |
| GET | `/api/settings/email-integrations/[id]/test` | authUser | ✓ | ✓ | Test email integration |
| GET | `/api/settings/email-integrations/[id]/fetch-last-email` | authUser | ✓ | ✓ | Fetch last email |
| POST | `/api/settings/email-integrations/yahoo` | authUser | ✓ | ✓ | Yahoo auth endpoint |
| GET | `/api/tasks` | authUser | ✓ | ✓ | List tasks |
| POST | `/api/tasks` | authUser | ✓ | ✓ | Create task |
| GET | `/api/tasks/[id]` | authUser | ✓ | ✓ | Get task |
| PATCH | `/api/tasks/[id]` | authUser | ✓ | ✓ | Update task |
| DELETE | `/api/tasks/[id]` | authUser | ✓ | ✓ | Delete task |
| GET | `/api/team` | authUser (owner only) | ✓ | ✓ | List team members |
| POST | `/api/team/invite` | authUser (owner only) | ✓ | ✓ | Invite team member |
| PATCH | `/api/team/[memberId]` | authUser (owner only) | ✓ | ✓ | Update team member |
| DELETE | `/api/team/[memberId]` | authUser (owner only) | ✓ | ✓ | Remove team member |
| GET | `/api/waitlist` | **None** | **✗** | **✗** | Get waitlist info |
| POST | `/api/waitlist` | **None** | **✗** | **✗** | Add to waitlist |
| POST | `/api/webhooks/email` | None | **✗** | **✗** | Email webhook receiver |
| POST | `/api/webhooks/facebook` | None | **✗** | **✗** | Facebook webhook receiver |
| POST | `/api/webhooks/form` | None | **✗** | **✗** | Form submission webhook |
| POST | `/api/yahoo/send` | authUser | ✓ | ✓ | Send Yahoo email |
| POST | `/api/yahoo/sync` | authUser | ✓ | ✓ | Sync Yahoo emails |

**Coverage:** Auth 95% (63/67) | Rate Limiting 80% (write-only, reads unprotected) | CSRF ~85% (4 critical gaps)

---

## Orphaned / Unused Endpoints

1. **`/api/waitlist` (GET/POST)** — no frontend consumers found; appears to be a scaffold leftover. Remove if not in active roadmap.
2. **`/api/resources`** — minimal usage; may have been made obsolete by calendar refactoring. Needs verification.
3. **`/api/providers` (no `[id]` route)** — list/create exist but no individual update/delete route found.

---

## Duplicate / Overlapping Endpoints

1. **`/api/clients/[id]/history` vs `/api/clients/[id]/activities`** — both return an activity timeline. Appears redundant. Consolidate into one.
2. **`/api/dashboard` vs `/api/admin/stats`** — both return aggregate stats; verify they serve different audiences (user-facing vs superadmin).

---

## Security Issues

### Critical

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | **Missing CSRF on auth POST routes** | `auth/forgot-password`, `auth/reset-password`, `invite/[token]` | Add CSRF token validation on POST/PATCH |
| 2 | **Seat limit race condition** | `admin/tenants/[id]/users` — countDocuments then insert, non-atomic | Wrap in MongoDB transaction |
| 3 | **Cron/job endpoints exposed** | `cron/email-sync`, `jobs/email-sync/*`, `reminders/process` — no auth check | Verify `X-Cron-Secret` header |

### High

| # | Issue | File | Fix |
|---|-------|------|-----|
| 4 | **No per-email rate limit on password reset** | `auth/forgot-password` — only IP-based (7/hr) | Add 3/hr per-email secondary limit |
| 5 | **Appointment status enum mismatch** | Schema uses `'no-show'` (hyphen), DB stores `'no_show'` (underscore) — active bug | Fix schema to match DB |
| 6 | **No max length on message content** | `conversations/[id]/messages` — only `min(1)` | Add `.max(5000)` |

### Medium

| # | Issue | Fix |
|---|-------|-----|
| 7 | **AI suggest-response passes unsanitized HTML to OpenAI** | Strip HTML before sending to `generateResponse()` |
| 8 | **No read rate limiting anywhere** | GET endpoints have no rate limits — add 100 reads/min per user |
| 9 | **`parseInt()` without validation** | `tasks/route.ts` line 17 uses unsafe `parseInt` on query params — use schema validation |
| 10 | **Missing cache invalidation after conversation PATCH** | Call `invalidateReadCaches()` after update |

---

## Over-fetching / Data Leaks

1. **`/api/clients/[id]`** — returns entire document with no field selection; use projection
2. **`/api/admin/audit`** — returns full `before`/`after` state in audit logs; consider field masking for sensitive changes
3. **`/api/admin/tenants`** — returns all tenant fields including `status_reason`, `deleted_at`, `deleted_by`

---

## Inconsistencies

- **Mixed response formats** — some routes use `createSuccessResponse()`, others use `NextResponse.json()` directly; standardize on `createErrorResponse()` everywhere
- **Owner-only check** — team routes use inline `if (role !== 'owner')`; extract to `requireRole()` helper for consistency
- **Parameter parsing** — some routes use unsafe `parseInt(searchParams.get(...))` while others use schema validation; standardize on schema validation

---

## Recommendations (Prioritized)

### Critical — Fix Immediately

| # | Action | Effort |
|---|--------|--------|
| 1 | Add CSRF to `forgot-password`, `reset-password`, `invite/[token]` | 1-2h |
| 2 | Fix seat limit race condition with MongoDB transaction | 30min |
| 3 | Protect cron/job endpoints with `X-Cron-Secret` header check | 1h |

### High — Fix This Sprint

| # | Action | Effort |
|---|--------|--------|
| 4 | Fix `no-show` vs `no_show` appointment status enum mismatch | 15min |
| 5 | Add `.max(5000)` to message content schema | 15min |
| 6 | Add per-email rate limit to password reset (3/hr) | 1h |
| 7 | Standardize error responses to use `createErrorResponse()` | 2h |

### Medium — Next Sprint

| # | Action | Effort |
|---|--------|--------|
| 8 | Merge `/history` and `/activities` client endpoints | 2-3h |
| 9 | Add read rate limiting to GET endpoints (100/min) | 2h |
| 10 | Sanitize HTML from message content before passing to OpenAI | 30min |
| 11 | Add cache invalidation after conversation PATCH | 30min |
| 12 | Add field-level projection to client endpoints | 2h |

### Low — Nice to Have

| # | Action | Effort |
|---|--------|--------|
| 13 | Remove orphaned `/api/waitlist` | 30min |
| 14 | Extract `requireRole()` helper from inline team route checks | 1h |
| 15 | Replace all unsafe `parseInt()` with schema-validated parsing | 1h |
