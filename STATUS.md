# m-saas Project Status

**Last Updated:** 2026-02-23
**MVP Version:** V1 (~90% complete)
**Database:** MongoDB
**Framework:** Next.js 14 App Router

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
- Benchmark bypass mode for reliable API benchmarking

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
- **Status:** Logic exists, needs cron wiring

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

*For setup instructions and API reference, see [GUIDE.md](GUIDE.md)*
*For detailed session history, see [SESSION-IMPLEMENTATION-LOG.md](SESSION-IMPLEMENTATION-LOG.md)*
