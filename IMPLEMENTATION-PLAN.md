# Implementation Plan — m-saas Foundation Fix

**Created:** 2026-02-19
**Goal:** Transform single-tenant prototype into production-ready multi-tenant SaaS
**Strategy:** Foundation first (auth, tenancy, security, infra), dental features later
**Workflow:** Cursor implements each phase → Claude Code reviews → next phase

---

## Workflow Protocol

### For Cursor (Implementer)
1. Read the task file for your current phase (`tasks/PHASE-XX.md`)
2. Implement ALL items in order — each has acceptance criteria
3. Run `npm run build && npx tsc --noEmit` after each major change
4. When done, update the task file: mark items as `[x]`
5. Commit with message: `PHASE-XX: <description>`
6. Tell the user "Phase XX is ready for review"

### For Claude Code (Reviewer)
1. User says "review phase XX"
2. Run verification commands listed in `tasks/REVIEW-CHECKLIST.md`
3. Check every acceptance criterion
4. Report: PASS / FAIL with specific issues
5. If PASS → user proceeds to next phase
6. If FAIL → Cursor fixes issues, re-review

---

## Phase Overview

| Phase | Name | Priority | Est. Effort | Depends On |
|-------|------|----------|-------------|------------|
| **0** | Emergency Fixes | CRITICAL | 1 day | Nothing |
| **1** | Authentication | CRITICAL | 3-4 days | Phase 0 |
| **2** | Multi-Tenancy | CRITICAL | 3-4 days | Phase 1 |
| **3** | Infrastructure | HIGH | 3-4 days | Phase 2 |
| **4** | Testing & Hardening | HIGH | 4-5 days | Phase 3 |
| **5** | Production Polish | MEDIUM | 3-4 days | Phase 4 |

**Total: ~17-21 working days to production-ready MVP**

---

## Phase 0: Emergency Fixes (Day 1)

Remove data-loss risks and security holes that exist RIGHT NOW.

- Remove `writeMongoCollection()` destructive function
- Remove `getMongoData()` full-scan cache + all `invalidateMongoCache()` calls
- Fix encryption key fallback (crash if missing, no hardcoded default)
- Add ownership checks to all DELETE/PATCH routes
- Remove dead code (`nul` file, legacy JSON storage references)

**Task file:** `tasks/PHASE-00-emergency.md`

---

## Phase 1: Authentication — Invite-Only + Super-Admin Dashboard (Days 2-6)

No SaaS without auth. Everything else depends on this. **No public registration** — this is an invite-only B2B platform.

- Install and configure NextAuth v5 (Credentials only, no OAuth yet)
- Super-admin seed script (creates your platform admin account)
- **Super-admin dashboard** at `/admin` — create tenants, manage clinics, invite owners
- **Invite flow**: Admin creates tenant → system emails clinic owner → owner sets password
- Login page (email + password only)
- Set-password page (`/invite/{token}`)
- Auth middleware: protect all routes, separate super-admin vs tenant access
- Replace all `DEFAULT_USER_ID` / `userId: 1` with session user

**Task file:** `tasks/PHASE-01-auth.md`

---

## Phase 2: Multi-Tenancy (Days 6-9)

Data isolation between clinics. Without this, Clinic A sees Clinic B's patients.

- Create `tenants` collection with schema validation
- Add `tenant_id` field to ALL existing collections (migration script)
- Create `getAuthContext()` helper that extracts `userId + tenantId` from session
- Update ALL API routes to filter by `tenant_id`
- Add compound indexes (`tenant_id` + existing fields)
- Team invitation flow (invite by email, accept, join tenant)
- RBAC: owner / admin / staff / viewer roles

**Task file:** `tasks/PHASE-02-tenancy.md`

---

## Phase 3: Infrastructure (Days 10-13)

Replace prototype-level infra with production-grade services.

- Move file storage from local filesystem to Cloudflare R2 (or Supabase Storage)
- Set up Upstash Redis for caching + rate limiting
- Replace in-memory rate limiting with Redis-backed
- Set up Upstash QStash for background jobs (email sync, reminders)
- Configure Vercel deployment (env vars, preview deploys)
- Set up Sentry for error tracking
- Add database indexes for all hot query paths
- Add security headers (CSP, CORS, X-Frame-Options)

**Task file:** `tasks/PHASE-03-infrastructure.md`

---

## Phase 4: Testing & Hardening (Days 14-18)

Confidence that nothing breaks when you ship.

- Set up Vitest + MongoDB Memory Server
- Unit tests: calendar conflict detection, client matching, validation schemas
- Integration tests: auth flows, tenant isolation, CRUD operations
- Add audit logging (who did what, when, from where)
- Add soft deletes to appointments and conversations
- Input sanitization (DOMPurify) on all user-content routes
- Fix `any` types in StorageData and across lib files
- Add CSRF protection to mutation routes

**Task file:** `tasks/PHASE-04-testing.md`

---

## Phase 5: Production Polish (Days 19-22)

Ready for pilot customers.

- Email reminders via Resend (replace nodemailer stub)
- SMS reminders via Twilio (replace stub)
- Stripe billing integration (free/starter/pro plans)
- Provider PATCH/DELETE endpoints (currently missing)
- Resource PATCH/DELETE endpoints (currently missing)
- Landing page / marketing page
- Proper error pages (401, 403, 404, 500)
- Performance: code splitting, lazy-loaded modals

**Task file:** `tasks/PHASE-05-polish.md`

---

## Files in this directory

```
d:\m-saas\
  IMPLEMENTATION-PLAN.md          ← This file (master plan)
  tasks/
    PHASE-00-emergency.md         ← Cursor task: emergency fixes
    PHASE-01-auth.md              ← Cursor task: authentication
    PHASE-02-tenancy.md           ← Cursor task: multi-tenancy
    PHASE-03-infrastructure.md    ← Cursor task: infra upgrades
    PHASE-04-testing.md           ← Cursor task: tests & hardening
    PHASE-05-polish.md            ← Cursor task: production polish
    REVIEW-CHECKLIST.md           ← Claude Code: verification steps per phase
  REVIEW-phase1.md                ← Architecture review (reference)
  REVIEW-phase2.md                ← Feature review (reference)
  REVIEW-phase3-5.md              ← Gap analysis + target arch (reference)
```

---

## Rules for Cursor

1. **One phase at a time.** Do NOT skip ahead.
2. **Build must pass** after every task. Run `npm run build && npx tsc --noEmit`.
3. **Do NOT install unnecessary packages.** Each task file lists exact dependencies.
4. **Follow existing patterns** where they're good (Zod validation, error-handler).
5. **Break existing patterns** where they're bad (the task file will tell you).
6. **Commit after each phase.** Message format: `PHASE-XX: description`
7. **Reference the review files** (`REVIEW-phase1.md`, etc.) for context on WHY each fix matters.
8. **Do NOT touch dental/domain features yet.** Foundation only.
