# Review Checklist — Claude Code Verification

**Usage:** After Cursor completes a phase, the user says "review phase XX" to Claude Code.
Claude Code runs these checks and reports PASS or FAIL.

---

## Phase 0: Emergency Fixes

### Automated checks:
```bash
cd d:/m-saas

# Build must pass
npm run build && npx tsc --noEmit

# Destructive functions removed (should return 0 results)
grep -r "writeMongoCollection" --include="*.ts" --include="*.tsx" lib/ app/
grep -r "getMongoData" --include="*.ts" --include="*.tsx" lib/ app/
grep -r "invalidateMongoCache" --include="*.ts" --include="*.tsx" lib/ app/

# Encryption fallback removed
grep -r "default-insecure-key" --include="*.ts" lib/

# Dead file removed
ls -la nul 2>/dev/null && echo "FAIL: nul file still exists" || echo "PASS: nul removed"
```

### Manual review:
- [ ] Read `lib/encryption.ts` — verify it throws on missing ENCRYPTION_KEY
- [ ] Read `lib/db/mongo.ts` — verify no full-collection delete/replace functions
- [ ] Spot-check 3 DELETE route handlers — verify they include `user_id` in query filter
- [ ] Verify `.env.example` includes ENCRYPTION_KEY

---

## Phase 1: Authentication (Invite-Only + Super-Admin Dashboard)

### Automated checks:
```bash
cd d:/m-saas

npm run build && npx tsc --noEmit

# Core auth files exist
ls lib/auth.ts lib/auth-helpers.ts lib/invite.ts lib/email.ts
ls app/api/auth/\[...nextauth\]/route.ts

# Login page exists (NO register page)
ls "app/(auth)/login/page.tsx"
ls "app/(auth)/invite/[token]/page.tsx"

# Register page must NOT exist
ls "app/(auth)/register/page.tsx" 2>/dev/null && echo "FAIL: register page exists" || echo "PASS: no register page"

# Super-admin dashboard exists
ls "app/(admin)/admin/page.tsx"
ls "app/(admin)/admin/tenants/page.tsx"
ls "app/(admin)/admin/tenants/new/page.tsx"
ls "app/(admin)/admin/tenants/[id]/page.tsx"

# Admin API routes exist
ls app/api/admin/tenants/route.ts
ls app/api/admin/stats/route.ts

# Invite API exists
ls app/api/invite/\[token\]/route.ts

# DEFAULT_USER_ID removed
grep -r "DEFAULT_USER_ID" --include="*.ts" --include="*.tsx" lib/ app/
# Should return 0

# No hardcoded userId defaults
grep -r "\.default(1)" --include="*.ts" lib/validation.ts
# Should return 0

# SessionProvider in layout
grep -r "SessionProvider" app/layout.tsx

# No Google OAuth (not yet)
grep -r "Google\|google" lib/auth.ts
# Should return 0 (no Google provider)

# Super-admin script exists
ls scripts/create-super-admin.ts
```

### Manual review:
- [ ] Read `lib/auth.ts` — verify Credentials provider ONLY (no Google OAuth)
- [ ] Read `lib/auth-helpers.ts` — verify:
  - `getAuthUser()` and `getSuperAdmin()` helpers
  - `UserRole` type is `'super_admin' | 'owner' | 'staff'` (no `admin`, no `viewer`)
  - `ROLE_HIERARCHY` is `['staff', 'owner', 'super_admin']` (no `admin`, no `viewer`)
- [ ] Read `lib/invite.ts` — verify token creation, validation, 48h expiry, email sending
- [ ] Read `lib/email.ts` — verify Resend integration with graceful fallback
- [ ] Read `middleware.ts` — verify:
  - Unauthenticated → 401 / redirect to login
  - Non-super-admin on `/admin` → 403 / redirect
  - Super-admin on `/admin` → allowed
  - User without tenant on tenant routes → blocked
  - Public paths: `/login`, `/invite/*`, `/api/auth/*`, `/api/webhooks/*`
- [ ] Read `app/(admin)/admin/tenants/new/page.tsx` — verify create tenant form:
  - Clinic name, owner email, owner name, plan selector, **max_seats field (number, min 1, default 1)**
  - Creates tenant (with `max_seats`) + user + team_member + invite token
  - Owner user gets `role: 'owner'` (not `admin`)
  - Sends invite email
- [ ] Read `app/(admin)/admin/tenants/[id]/page.tsx` — verify tenant detail:
  - Shows **seat usage** (e.g. "3 / 5 seats used")
  - Super-admin can **change max_seats** (increase or decrease)
  - Decreasing below current active count shows warning but is allowed
- [ ] Read `app/(auth)/invite/[token]/page.tsx` — verify set-password flow:
  - Shows email (read-only) and tenant name
  - Password + confirm password fields
  - Sets password hash, activates user, marks token used
  - Redirects to login
- [ ] Spot-check 5 API routes — verify they use `getAuthUser()` not `DEFAULT_USER_ID`
- [ ] Verify admin routes use `getSuperAdmin()` guard
- [ ] Verify NO public registration exists anywhere
- [ ] Verify NO references to `admin` role in code (only `super_admin`, `owner`, `staff`)

---

## Phase 2: Multi-Tenancy

### Automated checks:
```bash
cd d:/m-saas

npm run build && npx tsc --noEmit

# Tenant model exists
ls lib/types/tenant.ts

# tenant_id used widely
grep -r "tenant_id" --include="*.ts" app/api/ | wc -l
# Should be 50+ (every route)

# Migration script exists
ls scripts/migrate-add-tenant-id.ts

# Team routes exist
ls app/api/team/route.ts app/api/team/invite/route.ts

# max_seats field exists in tenant creation
grep -r "max_seats" --include="*.ts" app/api/admin/tenants/ app/api/team/
# Should show max_seats in tenant creation AND seat limit check in team invite
```

### Manual review:
- [ ] Read `lib/auth-helpers.ts` — verify `getAuthUser()` returns `tenantId`
- [ ] Spot-check 5 API routes — verify ALL queries include `tenant_id`
- [ ] Verify `getAuthUser()` populates tenantId from user record
- [ ] Verify team invitation flow (create invite, accept invite)
- [ ] Check that index migration script includes `tenant_id` compound indexes
- [ ] **Read `app/api/team/invite/route.ts` — verify:**
  - Only `owner` role can invite (staff gets 403)
  - All invitees get `staff` role (no role selection — no `admin` role in MVP)
  - Seat limit enforcement: counts active+pending (non-removed) team_members
  - Compares against `tenant.max_seats`
  - Returns 403 with clear message when at limit
  - Removing a member (status → 'removed') frees a seat for future invites
- [ ] **Read `app/api/team/route.ts` — verify:**
  - GET response includes current member count and max_seats
  - Only owner can access team list (staff gets 403)
- [ ] **Verify no `admin` role references in tenant-scoped code** (only `super_admin`, `owner`, `staff`)

### Critical verification:
- [ ] **Create two test users with different tenants**
- [ ] **User A creates a client → User B cannot see it via API**
- [ ] **User A creates an appointment → User B cannot see it via API**
- [ ] **Seat limit test:** Set tenant max_seats=2, add owner (1/2), invite staff (2/2), try to invite another → should get 403
- [ ] **Seat reduction test:** Super-admin reduces max_seats to 1 (below current 2 active) → allowed, but new invites blocked
- [ ] **Staff permission test:** Staff cannot access `/api/team/invite` (403), cannot access clinic settings (403)

---

## Phase 3: Infrastructure

### Automated checks:
```bash
cd d:/m-saas

npm run build && npx tsc --noEmit

# No local filesystem storage
grep -r "fs.writeFileSync\|UPLOAD_DIR\|uploads/" --include="*.ts" app/api/
# Should return 0 (or only migration script)

# Cloud storage exists
ls lib/storage.ts

# Redis module exists
ls lib/redis.ts

# Security headers in config
grep -r "X-Frame-Options" next.config.js

# Sentry configured
ls sentry.client.config.ts sentry.server.config.ts 2>/dev/null

# Vercel config
ls vercel.json

# .env.example complete
wc -l .env.example
# Should have 15+ variables
```

### Manual review:
- [ ] Read `lib/storage.ts` — verify cloud upload/download/signedUrl/delete
- [ ] Read `lib/redis.ts` — verify cache helpers with graceful fallback
- [ ] Read `middleware.ts` — verify Redis-backed rate limiting
- [ ] Verify `vercel.json` has cron jobs configured
- [ ] Verify `next.config.js` has security headers
- [ ] Verify `.env.example` has ALL required variables

---

## Phase 4: Testing & Hardening

### Automated checks:
```bash
cd d:/m-saas

npm run build && npx tsc --noEmit

# Tests pass
npm run test:run

# Test count
npm run test:run 2>&1 | tail -5
# Should show 35+ tests

# Audit logging exists
ls lib/audit.ts
grep -r "logAudit" --include="*.ts" app/api/ | wc -l
# Should be 10+ (all DELETE/PATCH routes)

# any type reduction
grep -r ": any" --include="*.ts" lib/ | wc -l
# Should be significantly less than 110

# Sanitization
grep -r "sanitize\|DOMPurify\|purify" --include="*.ts" lib/ app/api/ | wc -l
# Should be 5+ files
```

### Manual review:
- [ ] Read 3 test files — verify tests are meaningful (not just stubs)
- [ ] Read `lib/audit.ts` — verify audit log structure
- [ ] Verify audit logging on DELETE routes
- [ ] Verify soft deletes on appointments (deleted_at instead of deleteOne)
- [ ] Run `grep -r ": any" lib/` and review remaining `any` usages (should be justified)
- [ ] Verify CSRF protection in middleware

---

## Phase 5: Production Polish

### Automated checks:
```bash
cd d:/m-saas

npm run build && npx tsc --noEmit
npm run test:run

# Email module
ls lib/email.ts

# SMS module
ls lib/sms.ts

# Stripe module
ls lib/stripe.ts

# Provider CRUD
ls app/api/providers/\[id\]/route.ts

# Error pages
ls app/not-found.tsx app/error.tsx

# Settings page
ls app/settings/page.tsx
```

### Manual review:
- [ ] Read `lib/email.ts` — verify Resend integration
- [ ] Read `lib/sms.ts` — verify Twilio integration
- [ ] Read `lib/stripe.ts` — verify plan definitions
- [ ] Read `app/api/billing/webhook/route.ts` — verify Stripe webhook handling
- [ ] Verify provider PATCH/DELETE endpoints
- [ ] Verify error pages render
- [ ] Verify lazy-loaded modals in calendar

---

## Final Production Readiness Check

Run ALL of these:
```bash
cd d:/m-saas

# Full build
npm run build

# Type check
npx tsc --noEmit

# All tests pass
npm run test:run

# No destructive functions
grep -r "writeMongoCollection\|getMongoData\|deleteMany({})" --include="*.ts" lib/ app/

# No hardcoded user IDs
grep -r "DEFAULT_USER_ID\|userId.*=.*1\b" --include="*.ts" lib/constants.ts lib/validation.ts

# No insecure encryption
grep -r "default-insecure-key" --include="*.ts" lib/

# No local file storage in routes
grep -r "fs.writeFileSync" --include="*.ts" app/api/

# Tenant isolation in place
grep -r "tenant_id" --include="*.ts" app/api/ | wc -l

# Audit logging in place
grep -r "logAudit" --include="*.ts" app/api/ | wc -l

# Test count
npm run test:run 2>&1 | grep "Tests"
```

### Verdict:
- **PASS:** All checks green → Ready for pilot customers
- **FAIL:** List specific failures → Cursor fixes → Re-review
