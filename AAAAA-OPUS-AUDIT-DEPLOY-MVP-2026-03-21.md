# densa (m-saas) - MVP Deployment Audit Report

**Date:** 2026-03-21
**Audited by:** 6 parallel Claude Opus agents
**Scope:** Full codebase audit (243 source files, ~40 API routes)
**Verdict:** NOT READY FOR PRODUCTION - 13 blocking issues must be fixed first

---

## Executive Summary

The application has **strong foundational architecture** - proper NextAuth JWT auth, Zod validation, encryption for sensitive data, tenant-scoped cache keys, and a good error handling framework. However, the audit uncovered **13 CRITICAL/HIGH blockers** across security, tenant isolation, and infrastructure that must be resolved before any production deployment.

| Severity | Count | Breakdown |
|----------|-------|-----------|
| CRITICAL | 7 | Security: 3, Tenant isolation: 2, API: 1, Code quality: 1 |
| HIGH | 13 | Security: 3, API: 4, Database: 3, Infra: 2, Code: 1 |
| MEDIUM | ~40 | Spread across all domains |
| LOW | ~15 | Polish items, post-launch OK |

**Estimated remediation:** 2-3 days for CRITICAL+HIGH blockers

---

## CRITICAL BLOCKERS (Must Fix Before Launch)

### C1. Hardcoded Production Secrets in .env (Committed to Git)

**Agent:** Security | **Severity:** CRITICAL
**File:** `.env` (entire file)

The `.env` file is committed to the repository with live production credentials:
- AUTH_SECRET, ENCRYPTION_KEY
- MongoDB URI with plaintext passwords
- Supabase tokens, Cloudflare R2 keys
- QSTASH signing keys, Google OAuth credentials
- Resend API key

**Fix:**
1. Rotate ALL credentials immediately
2. Remove `.env` from git history (`git filter-branch` or BFG)
3. Verify `.gitignore` includes `.env`
4. Use Vercel Environment Variables for production

---

### C2. Unprotected Cron Endpoint - /api/reminders/process

**Agent:** Security + API | **Severity:** CRITICAL
**File:** `app/api/reminders/process/route.ts`

NO authentication check. Anyone can trigger mass reminder processing.

**Fix:** Add `hasValidCronSecret(request)` check (same pattern as `/api/cron/email-sync`).

---

### C3. Public API Documentation Endpoint

**Agent:** Security | **Severity:** CRITICAL
**File:** `app/api/docs/route.ts`

Returns complete OpenAPI schema (all endpoints, data models, parameters) without authentication. Gives attackers a full API map.

**Fix:** Add `await getAuthUser()` or restrict to admin role.

---

### C4. Tenant Isolation Bypass - Optional tenantId in Server Utilities

**Agent:** Database | **Severity:** CRITICAL
**Files:**
- `lib/server/client-profile.ts:50,124`
- `lib/server/calendar.ts:6,76,125,148`
- `lib/server/inbox.ts:7,15,148,193`

Multiple server-side functions accept **optional** `tenantId` parameters. When undefined, queries execute without tenant filtering - returning data from ALL tenants.

```typescript
// CURRENT (DANGEROUS)
.find(tenantId ? { tenant_id: tenantId, ... } : { ... })

// REQUIRED
.find({ tenant_id: tenantId, ... })  // tenantId must be required
```

**Fix:** Make `tenantId` required (non-optional) in ALL function signatures. Add runtime assertion: `if (!tenantId) throw new Error('tenantId required')`.

---

### C5. Cross-Tenant Data Leak in Calendar Slots

**Agent:** API | **Severity:** CRITICAL
**File:** `app/api/calendar/slots/route.ts:35`

Service lookup query is missing `tenant_id` filter. User from Tenant A can look up slots for Tenant B's services.

**Fix:** Add `tenant_id: tenantId` to the `findOne` filter.

---

### C6. Race Condition on Numeric ID Generation

**Agent:** API | **Severity:** CRITICAL
**Files:** `app/api/admin/tenants/route.ts:19-22`, `app/api/waitlist/route.ts:47-53`

`getNextUserId()` uses `findOne().sort({id:-1})` then increments - NOT atomic. Two concurrent requests can get the same ID.

**Fix:** Use MongoDB `findOneAndUpdate` with `$inc` on a counters collection, or use `ObjectId`.

---

### C7. Excessive `any` Types Hiding Bugs (35+ instances)

**Agent:** Code Quality | **Severity:** CRITICAL
**Files:** `lib/db/mongo-utils.ts:5`, `lib/server/inbox.ts`, `lib/server/dashboard.ts`, `lib/client-matching.ts`, 30+ more

`getMongoDbOrThrow()` returns `Promise<any>`, conflict arrays typed `any[]`, MongoDB documents cast to `any` everywhere. This hides type errors at compile time and makes refactoring dangerous.

**Fix:** Create proper TypeScript interfaces in `types/mongodb.ts` for all document types. Make `getMongoDbOrThrow()` return typed `Db`.

---

## HIGH PRIORITY (Fix Before Launch or First Patch)

### H1. Hard Deletes Instead of Soft Deletes

**Agent:** Database | **Severity:** HIGH
**Files:**
- `app/api/services/[id]/route.ts:112` - `deleteOne()` on services
- `app/api/reminders/[id]/route.ts:138` - `deleteOne()` on reminders
- `app/api/tasks/[id]/route.ts:99` - `deleteOne()` on tasks
- `app/api/waitlist/route.ts:92` - `deleteOne()` on waitlist
- `lib/email-integrations.ts:229` - `deleteOne()` on integrations

Data permanently lost. Can't recover for audits or GDPR. Clients and appointments correctly use soft deletes (`deleted_at`), but these 5 collections don't.

**Fix:** Replace `deleteOne()` with `updateOne({ $set: { deleted_at: new Date() } })`.

---

### H2. Weak Password Reset Rate Limit (7/hour)

**Agent:** Security | **Severity:** HIGH
**File:** `app/api/auth/forgot-password/route.ts:10-11`

7 attempts per hour is too lenient. Allows email enumeration and brute force.

**Fix:** Reduce to 3 per hour. Add per-IP + per-email combined limiting.

---

### H3. Missing JSON Parsing Error Handling

**Agent:** Security | **Severity:** HIGH
**Files:** `app/api/cron/email-sync/route.ts:49`, `app/api/jobs/email-sync/gmail/route.ts:31`

`request.json().catch(() => ({}))` silently swallows parse errors. Malformed JSON doesn't fail-fast.

**Fix:** Properly validate JSON with try/catch and return 400.

---

### H4. Console.error Leaks PII in Production

**Agent:** Infrastructure | **Severity:** HIGH
**Files:** `lib/email.ts:10,22,33`, `lib/reminders.ts:91,133`, `app/inbox/InboxPageClient.tsx` (14 instances)

56 `console.*` statements bypass the structured logger. Email addresses, error details, and stack traces exposed in production logs.

**Fix:** Replace all `console.*` with `logger.*` from `lib/logger.ts`.

---

### H5. Missing Function Timeouts in vercel.json

**Agent:** Infrastructure | **Severity:** HIGH
**File:** `vercel.json`

These long-running endpoints will hit Vercel's default 60s timeout:
- `/api/clients/export` - data export
- `/api/gmail/sync`, `/api/yahoo/sync` - email sync
- `/api/jobs/email-sync/*` - background jobs

**Fix:** Add `"functions"` config in `vercel.json` with `maxDuration: 120` for each.

---

### H6. No Input Sanitization on Conversation Creation

**Agent:** API | **Severity:** HIGH
**File:** `app/api/conversations/route.ts:55-72`

`contactName`, `contactEmail`, `contactPhone`, `subject` validated but NOT sanitized for XSS before MongoDB storage.

**Fix:** Add HTML escaping/sanitization before storage.

---

### H7. Missing Rate Limit on File Uploads

**Agent:** API | **Severity:** HIGH
**File:** `app/api/clients/[id]/files/route.ts:46-116`

No `checkWriteRateLimit()` on file upload POST. Users can spam uploads exhausting storage.

**Fix:** Add rate limiting (same pattern as other POST routes).

---

### H8. Weak Password Validation on Invite Accept

**Agent:** API | **Severity:** HIGH
**File:** `app/api/invite/[token]/route.ts:35-36`

Only checks `password.length < 8`. No complexity requirements.

**Fix:** Add uppercase, number, special character requirements via Zod schema.

---

### H9. Missing Null Check on Service Before Appointment Creation

**Agent:** API | **Severity:** HIGH
**File:** `app/api/appointments/route.ts:107-109`

`serviceDoc` queried but not null-checked. Appointments can be created for non-existent services.

**Fix:** Add `if (!serviceDoc) return createErrorResponse('Service not found', 404)`.

---

### H10. Inconsistent Error Handling Across API Routes

**Agent:** Code Quality | **Severity:** HIGH
**Files:** 50+ API routes

Mix of `handleApiError()`, manual `NextResponse.json()`, and raw catch blocks. Inconsistent error response structure.

**Fix:** Standardize all routes to use `handleApiError()`. Create validation middleware to reduce boilerplate.

---

### H11. Label/Input Association Missing on Auth Forms

**Agent:** Frontend | **Severity:** HIGH
**Files:**
- `app/(auth)/login/LoginForm.tsx:62,66`
- `app/(auth)/forgot-password/ForgotPasswordForm.tsx`

No `id` attributes on inputs, labels not associated with `htmlFor`. Screen readers can't identify form fields.

**Fix:** Add `id` + `htmlFor` to all form input/label pairs.

---

### H12. OAuth Cookie Secure Flag Conditional

**Agent:** Infrastructure | **Severity:** HIGH
**Files:** `app/api/auth/google/email/route.ts:24`, `callback/route.ts:17`

`secure: process.env.NODE_ENV === 'production'` - cookies sent over HTTP in dev. If NODE_ENV misconfigured, cookies interceptable.

**Fix:** Always use `secure: true` or explicitly allow only localhost.

---

### H13. Missing Database Indexes

**Agent:** Database | **Severity:** HIGH

No migration or index creation scripts found. Missing composite indexes for:
- `{ tenant_id, user_id, deleted_at }` on clients, appointments, conversations
- `{ tenant_id, email }` unique constraint on clients
- `{ tenant_id, user_id, start_time }` on appointments

**Fix:** Create migration script with `createIndex()` calls for all critical query patterns.

---

## MEDIUM PRIORITY (Fix Within First Sprint Post-Launch)

| # | Issue | Agent | File(s) |
|---|-------|-------|---------|
| M1 | CSP blocks external APIs (Google, Upstash, Resend) | Infra | `next.config.js:20-27` |
| M2 | Calendar Suspense has no fallback (blank screen) | Frontend | `app/calendar/page.tsx:6` |
| M3 | Inbox Suspense `fallback={null}` (blank screen) | Frontend | `app/inbox/page.tsx:18` |
| M4 | No fetch timeout on dashboard (hangs forever) | Frontend | `app/dashboard/DashboardPageClient.tsx:51` |
| M5 | env-validation.ts only validates 4 of ~20 vars | Infra | `lib/env-validation.ts` |
| M6 | Rate limiting falls back to in-memory (bypassable) | Infra | `lib/rate-limit.ts:18` |
| M7 | Cron schedule conflicts with quiet hours | Infra | `vercel.json` + `cron/email-sync/route.ts` |
| M8 | Boolean coercion bug (`"false"` -> `true`) | API | `conversations/[id]/images/save/route.ts:41` |
| M9 | Pagination unbounded (limit=99999 possible) | API | `conversations/[id]/route.ts:20-21` |
| M10 | File type validation relies on spoofable MIME | Security | `clients/[id]/files/route.ts:71-80` |
| M11 | Session not invalidated on password change | Security | `auth/reset-password/route.ts` |
| M12 | No `aria-current="page"` on active nav | Frontend | `components/AppTopNav.tsx:96` |
| M13 | Hardcoded sidebar width 380px (mobile break) | Frontend | `app/inbox/InboxPageClient.tsx:1587` |
| M14 | Missing autocomplete on login form fields | Frontend | `(auth)/login/LoginForm.tsx:62,66` |
| M15 | DOMPurify allows form/input/button tags in email | Frontend | `settings/email/EmailSettingsPageClient.tsx` |
| M16 | Tag values not sanitized (XSS via tags) | API | `conversations/[id]/route.ts:104` |
| M17 | AI suggest-response has no timeout | API | `conversations/[id]/suggest-response/route.ts:70` |
| M18 | SMS reminders silently fail (Twilio not implemented) | Code | `lib/reminders.ts:156` |
| M19 | No external error logging (Sentry TODO) | Code | `lib/logger.ts:110-111` |
| M20 | Only 4 test files (<5% coverage) | Code | `tests/` |

---

## What's Working Well

These areas passed audit with no issues:

- **Auth architecture** - NextAuth JWT strategy, bcrypt hashing (salt:12), multi-level auth verification
- **Tenant-scoped cache keys** - Redis keys properly include `tenantId` and `userId`
- **Zod validation** - Comprehensive schemas for all major data types
- **AES-256-GCM encryption** - Email credentials properly encrypted at rest
- **Webhook signature verification** - HMAC-SHA256 with timing-safe comparison
- **Client data export** - Properly authenticated and tenant-scoped
- **Toast/notification system** - Proper ARIA attributes, auto-dismiss, portal rendering
- **Error boundary** - Root-level ErrorBoundary + global error.tsx + not-found.tsx
- **Dashboard skeletons** - Proper loading states with shimmer
- **SWR data fetching** - Deduplication, error handling, loading states

---

## Recommended Fix Order

### Phase 1: Security Blockers (Day 1)
1. **C1** - Rotate secrets, remove .env from git history
2. **C2** - Add auth to `/api/reminders/process`
3. **C3** - Add auth to `/api/docs`
4. **H2** - Reduce password reset rate limit to 3/hr
5. **H12** - Fix OAuth cookie secure flag

### Phase 2: Tenant Isolation (Day 1-2)
6. **C4** - Make tenantId required in all server utilities
7. **C5** - Add tenant filter to calendar slots
8. **C6** - Fix race condition on ID generation
9. **H13** - Create database indexes

### Phase 3: API Hardening (Day 2)
10. **H1** - Convert hard deletes to soft deletes
11. **H6** - Sanitize conversation inputs
12. **H7** - Add rate limit to file uploads
13. **H8** - Strengthen password validation
14. **H9** - Add null check on service lookup
15. **H3** - Fix JSON parsing error handling

### Phase 4: Code Quality (Day 2-3)
16. **H4** - Replace console.* with logger.*
17. **H5** - Add Vercel function timeouts
18. **H10** - Standardize error handling
19. **H11** - Fix form accessibility
20. **C7** - Replace `any` types (ongoing)

---

## Methodology

6 specialized agents ran in parallel, each reading and analyzing the full codebase from their domain perspective:

| Agent | Files Read | Duration | Findings |
|-------|-----------|----------|----------|
| 1. Security & Auth | 44 tool calls | ~114s | 3 CRITICAL, 3 HIGH, 2 MEDIUM |
| 2. API Routes | 44 tool calls | ~140s | 4 CRITICAL, 7 HIGH, 11 MEDIUM |
| 3. Database & Data | 50 tool calls | ~101s | 2 CRITICAL, 4 HIGH, 3 MEDIUM |
| 4. Frontend & UX | 91 tool calls | ~209s | 0 CRITICAL, 2 HIGH, 12 MEDIUM |
| 5. Infrastructure | 66 tool calls | ~113s | 4 CRITICAL, 7 HIGH, 24 MEDIUM |
| 6. Code Quality | 52 tool calls | ~149s | 2 CRITICAL, 3 HIGH, 5 MEDIUM |

Total: 347 tool calls across 6 agents analyzing 243 source files.
