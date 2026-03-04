# m-saas Project Status

**Last Updated:** 2026-03-04
**MVP Version:** V1 (~90% complete)
**Database:** MongoDB
**Framework:** Next.js App Router (updated to latest in security remediation pass)

---

## Quick Status

| Domain | Status | Progress |
|--------|--------|----------|
| Auth & Multi-Tenancy | Done | 100% |
| Dashboard | Done | 100% |
| CRM (Clients) | Done | 100% |
| Calendar & Appointments | Done (polish ongoing) | 95% |
| Inbox / Yahoo Integration | Done | 90% |
| Services Management | Done | 100% |
| Redis Caching | Done (disabled locally for testing) | 100% |
| Benchmarking Framework | Done | 100% |
| AI Agent | Mock fallback (OpenAI attempted) | 30% |
| Reminders | Logic exists, not automated | 40% |
| Payment Links | Not started | 0% |
| Gmail/Outlook Integration | Not started | 0% |

---

## Claude Review Status

### Inbox Provider Label Consistency â€” IMPLEMENTED (2026-03-04)
- Email conversations now render provider-aware labels in Inbox:
  - `Yahoo` with red badge
  - `Gmail` with green badge
  - fallback `Email` when provider cannot be inferred
- Backend now enriches conversation payload with `email_provider` in `lib/server/inbox.ts`.
- Label consistency applied in both conversation list and thread header meta (`app/inbox/InboxPageClient.tsx`).
- Validation:
  - `npx tsc --noEmit` passed

### Soft Delete + Error Pages Hardening — IMPLEMENTED (2026-03-04)
- Appointment deletion is now soft delete:
  - `DELETE /api/appointments/[id]` sets `deleted_at`, `deleted_by`, `updated_at` and returns HTTP 204.
- Soft-deleted appointments are excluded from reads in API routes and calendar server fetch:
  - `/api/appointments/[id]`
  - `/api/appointments` (via `lib/server/calendar.ts`)
  - `/api/clients/[id]/activities`
  - `/api/clients/[id]/history`
  - `/api/reminders`
  - `/api/reminders/[id]`
  - `/api/services/[id]` (service-in-use appointment count)
- Soft-deleted appointments are also excluded from operational scheduling logic:
  - `lib/calendar-conflicts.ts` (conflict checks)
  - `lib/calendar.ts` (available slots + isSlotAvailable)
  - `lib/reminders.ts` (24h reminder cron fetch/update)
- Added global dark-theme error pages:
  - `app/not-found.tsx` (404 with `Inapoi` + `Dashboard`)
  - `app/error.tsx` (runtime error boundary with `Incearca din nou` + `Dashboard`)
- Verification:
  - `npm run build` passed
  - `npx tsc --noEmit` passed

### Phase 3 Chapter 8 — ACCEPTED
- Cold-path performance refactor + regression fixes complete
- 6 invalid MongoDB `hint()` calls removed; silent `emptyDashboard()` fallback removed
- Benchmark 500 regressions resolved (0% errors in canonical run `20260221-102643`)
- **Known tradeoff:** Inbox p95 regressed +60-90% vs baseline (aggregation pipeline — correctness over raw speed)

### Section 35 Fix Batch — ACCEPTED (2026-02-23)
All 12 fixes from REVIEW-FIXES-REQUIRED.md verified:
- **Critical:** userId:1 hardcode removed; client dedup uses multi-match + email/phone disambiguation; rate-limit identity uses truthy checks + console.warn; save button disabled during confirmation; dashboard SWR error handling
- **High:** Inbox auth redirect; middleware simplified to pure method-based bucket; all userId schema fields removed; MongoDB search indexes migration added
- **Medium:** End-time boundary validation; client search error shown inline; duration rounding shows error instead of silent correction

**Local caveat:** Redis intentionally disabled for local testing; Windows `.next-build/trace` lock can intermittently block local builds

### Section 36 Email Integration Security + UX — IMPLEMENTED (2026-02-24)
- Removed Yahoo credential `.env` fallback in runtime send/sync config resolution (`lib/yahoo-mail.ts` now DB-only lookup).
- Migrated integration uniqueness model to per-user provider (`user_id + provider`) and aligned save/update behavior.
- Added migration script and executed successfully:
  - dropped `tenant_id_1_provider_1`
  - created unique `user_id_1_provider_1`
- Opened email integration settings endpoints to authenticated owner + staff (removed owner-only restriction).
- Fixed outbound send routes to use authenticated `userId + tenantId` credentials:
  - `/api/yahoo/send`
  - `/api/conversations/[id]/messages`
- Added clear 400 response when no Yahoo integration is connected (no fallback send).
- Fixed Yahoo Settings form Save button disabled-state bug (controlled password field).
- Updated Yahoo help link and accessibility label to:
  - `https://login.yahoo.com/myaccount/security/`
  - `Add Yahoo Connection by Creating an App Password`.

### Section 38 MongoDB ObjectId RSC Serialization Fix — IMPLEMENTED (2026-02-28)
- Fixed Next.js RSC boundary error: `Only plain objects can be passed to Client Components from Server Components`
- Root cause: `tenant_id` and other fields stored as MongoDB `ObjectId` instances were passing through the Server → Client boundary
- **`lib/db/mongo.ts`** — Updated `stripMongoId()` to convert all `ObjectId` instances to strings (previously only removed `_id`, leaving other ObjectId fields intact)
- **`app/api/providers/route.ts`** — Added missing `stripMongoId` call on `.toArray()` results before caching; previously returned raw MongoDB docs with unserializable ObjectId fields
- TypeScript check: `npx tsc --noEmit` → 0 errors

### Section 37 Security Audit Remediation — IMPLEMENTED (2026-02-24)
- Completed remaining code-level remediation from `SECURITY-AUDIT.md`:
  - webhook HMAC auth, TLS hardening, security headers/CSP
  - benchmark bypass removal, timing-safe cron secret check
  - logging hardening + redaction, Zod response sanitization
  - send/test rate limits, cron null-tenant filtering
  - integration create/delete audit logs and delete-time attachment cleanup
  - startup env validation for required secrets/config
- Encryption now supports versioned ciphertext prefix (`v1:iv:tag:ciphertext`) with legacy decrypt compatibility.
- Dependency policy updates:
  - `package.json` overrides added for `utf7`, `minimatch`, `glob`
  - `engines.node` set to `20.x`
  - `next` and `eslint-config-next` updated to latest
- `npm audit` reduced from `34` to `29` vulnerabilities after this pass.
- **Policy decision:** no `imap -> imapflow` migration.
- **Accepted risk (current):** remaining AWS SDK transitive vulnerability chain pending separate dependency lifecycle pass.
- **Manual infra follow-up:** set Vercel runtime to Node 20 and align dev machines to Node 20 LTS.

---

## What's Implemented

### Authentication & Multi-Tenancy
- NextAuth v5 credentials flow (`lib/auth.ts`)
- Auth helpers: `getAuthUser()`, `getSuperAdmin()`, `requireRole()` (`lib/auth-helpers.ts`)
- Login page, invite acceptance flow
- Tenant isolation: `tenant_id` filtering on all API routes (14+ routes verified)
- Middleware enforces tenant context, redirects unauthenticated users
- Role-based access control (owner, staff roles)
- Multi-tenant rate limiting (tenant+user key, fallback to IP)
- No hardcoded `userId` remaining anywhere in codebase

### Dashboard
- 6 stat cards (messages, appointments, clients, new clients, no-show rate, revenue)
- Messages per day chart (7 days), client growth chart
- Today's appointments list, top clients, inactive clients
- 9 parallel MongoDB queries via `Promise.all`
- Client-side rendering with SWR + skeleton loading state

### Calendar & Appointments
- Week/month/day views with appointment display
- Create/update/delete appointments with modals
- Conflict validation on both CREATE and UPDATE (excludes self on update)
- Service duration calculation, overlap detection
- Client suggestions from DB with prefill (name/email/phone)
- New-client confirmation before auto-create
- Editable date/time in modal, 15-minute duration increments
- Half-hour slot precision in week grid (`:00` / `:30` click positions)
- Empty-services fallback with demo seed
- Custom themed selectors in appointment modal:
  - `Data`, `Ora inceput`, `Ora final`, `Serviciu`
  - dropdown visual style aligned with `Nume client` suggestion list
  - `Ora inceput` + `Ora final` displayed on same row (responsive stack on mobile)
- Client-side rendering with SWR + skeleton loading state
- Search: debounced server-side query across client name/email/phone, category, notes

### Inbox / Yahoo Mail Integration
- Yahoo IMAP/SMTP integration (fetch + send)
- Provider-aware inbox labels: `Yahoo` (red) and `Gmail` (green) badges for email conversations
- HTML email rendering with DOMPurify + iframe isolation
- Conversation threading, tags, search/filter
- Attachment handling with R2 cloud storage
- Auto-sync via cron (`/api/cron/email-sync`, every 10 minutes)
- Romania quiet-hours guard (22:00-05:59 no cron)
- QStash queue integration with inline fallback
- Client-side rendering with skeleton loading state
- Hybrid search (debounced server query + local refinement)
- Status-aware error toasts (429, 401/403, generic)
- Toast dedupe to prevent spam during retries

### CRM (Clients)
- Client database with auto-creation from emails/appointments
- Deduplication: finds all name matches, disambiguates by email then phone, creates new client if still ambiguous (prevents merging distinct patients with the same name)
- Client profiles with history, statistics, tags, notes
- Search/filter, pagination (20/page), status management
- Skeleton loading state

### Services Management
- Full CRUD (create, read, update, delete)
- Properties: name, duration, price, description
- Service selection in appointments

### Redis Caching
- Upstash Redis integration (`lib/redis.ts`)
- `getCached()` wrapper with graceful fallback when Redis unavailable
- Cached GET endpoints: appointments, clients, services, providers, resources, dashboard
- Cache invalidation on mutations via `lib/cache-keys.ts`
- Cache key includes search params to avoid collisions
- Pattern-based invalidation using SCAN (not KEYS)

### Rate Limiting
- Distributed via Upstash sliding-window (production)
- In-memory fallback when Redis unavailable
- Buckets: read (high tolerance), write (mutations only), sync (strict 3/5min)
- Identity: tenant+user key preferred, fallback to user, then IP
- No benchmark bypass in production middleware

### Infrastructure
- Cloudflare R2 storage for file uploads (migrated from local disk)
- Benchmark framework: `bench:baseline`, `bench:compare`, `bench:report`, `bench:gui`
- MongoDB compound indexes for query performance
- Skeleton loading CSS with shimmer animation (`app/globals.css`)

### Admin
- Super-admin layout with sign-out button
- Tenant management, team/staff management
- Staff blocked from clinic settings/team endpoints

---

## What's NOT Implemented

### AI Agent
- Endpoint exists (`/api/conversations/[id]/suggest-response`)
- Attempts real OpenAI call if `OPENAI_API_KEY` is set
- Falls back to hardcoded Romanian mock response if key missing or call fails
- No calendar-aware slot suggestions, no context personalization
- **Status:** Functional mock, needs real integration

### Reminders
- `processReminders()` function exists in `lib/reminders.ts`
- Finds appointments 24h before, can send email reminders
- Twilio SMS is stubbed (returns false without credentials)
- **Not automated:** No cron job triggers the processor
- **Known inconsistency:** `lib/reminders.ts` still uses `nodemailer` with `EMAIL_USER`/`EMAIL_PASS` env vars for email delivery. The rest of the platform uses `lib/email.ts` (Resend). Gracefully skips when unconfigured — not a blocker — but must be migrated to `lib/email.ts` before reminders are wired up for production.
- **Status:** Logic exists, needs cron wiring + Resend migration

### Not Started
- Payment links (Stripe/PayPal)
- Gmail integration (OAuth2 + API)
- Outlook integration (Microsoft Graph)
- WhatsApp Business API
- Google Calendar two-way sync
- Form builder UI

---

## Benchmark Runbook

```bash
# Start app in prod mode
npm run build && npm run start

# Enable benchmark bypass (.env)
BENCHMARK_MODE=true
BENCHMARK_TOKEN=<secret>

# Capture baseline
npm run bench:baseline

# Compare after changes
npm run bench:compare -- --against <baselineRunId>

# View results
npm run bench:gui
# or: reports/benchmarks/<runId>/summary.md
```

### Redis Setup
1. Create Upstash Redis database (REST API enabled)
2. Add to `.env`: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
3. Restart app, verify `/dashboard`, `/clients`, `/calendar` work
4. Run benchmark baseline to confirm no rate-limit noise

---

## Technical Debt

1. **No automated tests** - Zero test coverage
2. **Mock AI responses** - Returns static data without OpenAI key
3. **Reminders not automated** - Function exists but no cron trigger
4. **Settings page size** - Large component (~500 lines), needs splitting
5. **Dashboard `{ }` block scope** - Unusual indentation pattern in `lib/server/dashboard.ts`, cosmetic

---

## Phase 3 Execution Protocol

- Canonical implementation order: `tasks/PHASE-03-infrastructure.md`
- Rule: One chapter at a time, Claude reviews before and after
- Do not start next chapter until acceptance criteria pass

---

---

## Production Launch Checklist (Vercel — not yet configured)

These items require manual action in the Vercel dashboard at launch time. They cannot be verified in code.

### Required before going live

- [ ] **Node.js runtime** — set to `20.x` in Vercel project settings → General → Node.js Version. The `engines.node` field in `package.json` declares intent but Vercel uses its own dashboard setting independently.

- [ ] **`WEBHOOK_SECRET` env var** — `/api/webhooks/email` returns 503 if this is missing. Add to Vercel Environment Variables before enabling any email webhook. Generate:
  ```
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

- [ ] **All secrets from `.env`** — copy every required variable to Vercel Environment Variables:
  - `MONGODB_URI`
  - `AUTH_SECRET` (32+ bytes, cryptographically random)
  - `ENCRYPTION_KEY` (exactly 64 hex chars — 32 bytes)
  - `CRON_SECRET`
  - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  - `QSTASH_TOKEN` (if using distributed cron)
  - `WEBHOOK_SECRET`
  - Cloudflare R2 / storage provider keys

- [ ] **`BENCHMARK_MODE` absent** — confirm this env var is not set (or is `false`) in the Vercel production environment.

- [ ] **HSTS preload** — `Strict-Transport-Security: preload` is already in `next.config.js`. Once the production domain is stable, submit it to [hstspreload.org](https://hstspreload.org).

- [ ] **`npm audit` on CI** — add `npm audit --audit-level=high` to the build step so new critical/high vulnerabilities block deployments automatically.

### Recommended post-launch (first 30 days)

- [ ] **MongoDB network access** — restrict Atlas IP allowlist to Vercel egress IPs only. Do not leave `0.0.0.0/0` open in production.
- [ ] **Upstash Redis** — disable public access; use token-based auth only.
- [ ] **Error monitoring** — integrate Sentry or equivalent so exceptions surface without requiring log access.
- [ ] **Rotate `ENCRYPTION_KEY`** — schedule first key rotation within 90 days of launch. Follow the Key Rotation Runbook in `SECURITY-AUDIT.md`.

---

*For setup instructions and API reference, see [GUIDE.md](GUIDE.md)*
*For detailed session history, see [SESSION-IMPLEMENTATION-LOG.md](SESSION-IMPLEMENTATION-LOG.md)*

## Section 38 Next.js 16 Route Handler Compatibility (Conversations) - PARTIAL (2026-02-24)
- Fixed runtime error in dynamic conversation routes after Next.js 16 upgrade where route `params` became async.
- Updated handlers to Next 16 contract (`params: Promise<...>` + `await params`) in:
  - `/api/conversations/[id]`
  - `/api/conversations/[id]/messages`
  - `/api/conversations/[id]/read`
  - `/api/conversations/[id]/suggest-response`
  - `/api/conversations/[id]/images/save`
  - `/api/conversations/[id]/attachments/[attachmentId]/save`
- Middleware convention migration already applied:
  - `middleware.ts` -> `proxy.ts`
  - exported handler renamed to `proxy`.
- Validation:
  - runtime error for `/api/conversations/[id]` resolved locally.
  - `npx tsc --noEmit` still reports remaining Next 16 route-context typing errors in other dynamic API routes (admin/clients/services/tasks/settings/invite/etc.), requiring a full route migration pass.

## Section 39 Critical Stabilization: Middleware + Next 16 Dynamic Routes - IMPLEMENTED (2026-02-24)
- Restored active middleware execution in production/runtime:
  - reverted file convention to `middleware.ts` (root)
  - restored handler export name to `middleware`
- Removed regression where middleware protections were not loaded.
- Completed Next.js 16 dynamic route migration for remaining API handlers (24 routes):
  - converted route context typing from sync params to async params (`params: Promise<...>`)
  - awaited params inside handlers before reading route keys
  - replaced direct `params.id`/`params.token`/`params.memberId` access patterns
- Areas completed:
  - `/api/admin/tenants/[id]` (+ `resend-invite`, `restore`, `users`)
  - `/api/admin/users/[id]` (+ `restore`)
  - `/api/clients/[id]` (+ `activities`, `files`, `files/[fileId]`, `download`, `preview`, `history`, `notes`, `stats`)
  - `/api/settings/email-integrations/[id]` (+ `test`, `fetch-last-email`)
  - `/api/appointments/[id]`, `/api/invite/[token]`, `/api/reminders/[id]`, `/api/services/[id]`, `/api/tasks/[id]`, `/api/team/[memberId]`
- Validation:
  - `npx tsc --noEmit` passes with zero errors.
