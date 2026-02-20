# PHASE 3: Infrastructure

**Priority:** HIGH — Production-grade services replace prototype-level infra
**Estimated effort:** 3-4 days
**Dependencies:** Phase 2 (tenancy) complete
**Commit message:** `PHASE-03: Cloud storage, Redis cache, background jobs, deployment config`

---

## Context

Read `REVIEW-phase3-5.md` sections 1.4 (Ephemeral File Storage), 2.2 (Rate Limiting), 4.3 (No Caching), 4.5 (Background Jobs).

Current state: Files on local disk (lost on deploy), in-memory rate limiting (resets on cold start), no caching layer, no background jobs, no error tracking, no deployment config.

---

## Task 3.1: Move file storage to cloud (Supabase Storage or Cloudflare R2)

### Install:
```bash
npm install @supabase/supabase-js
# OR for R2/S3:
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Pick ONE. Supabase Storage is simpler if you already have a Supabase account. R2 is cheaper at scale.

### Create `lib/storage.ts`:
```typescript
// Abstraction layer for file storage
export interface StorageProvider {
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
```

Implement for your chosen provider. Key format: `tenants/{tenantId}/clients/{clientId}/{timestamp}_{filename}`

### Update file routes:
- `app/api/clients/[id]/files/route.ts` — Upload to cloud instead of `fs.writeFileSync`
- `app/api/clients/[id]/files/[fileId]/download/route.ts` — Serve signed URL
- `app/api/clients/[id]/files/[fileId]/preview/route.ts` — Serve signed URL
- `app/api/clients/[id]/files/[fileId]/route.ts` — Delete from cloud
- Store `storage_key` in database instead of `file_path`

### Create migration for existing files:
```bash
# Script to upload existing local files to cloud storage
# scripts/migrate-files-to-cloud.ts
```

### Update `.env.example`:
```
# Storage (pick one)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
# OR
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT_URL=
R2_BUCKET_NAME=
```

### Acceptance criteria:
- [ ] `lib/storage.ts` exists with cloud storage abstraction
- [ ] File uploads go to cloud, not local filesystem
- [ ] File downloads use signed URLs (expire after 1 hour)
- [ ] Database stores `storage_key`, not `file_path`
- [ ] Old `uploads/` directory can be deleted (after migration)
- [ ] Build passes

---

## Task 3.2: Set up Redis for caching and rate limiting

### Install:
```bash
npm install @upstash/redis @upstash/ratelimit
```

### Create `lib/redis.ts`:
```typescript
import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;  // Graceful fallback for local dev
  }
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

// Cache helper
export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const r = getRedis();
  if (!r) return fetcher();  // No Redis = no cache

  const cached = await r.get<T>(key);
  if (cached) return cached;

  const data = await fetcher();
  await r.setex(key, ttlSeconds, JSON.stringify(data));
  return data;
}

export async function invalidateCache(pattern: string) {
  const r = getRedis();
  if (!r) return;

  // Use SCAN instead of KEYS (non-blocking)
  let cursor = 0;
  do {
    const [nextCursor, keys] = await r.scan(cursor, { match: pattern, count: 100 });
    cursor = nextCursor;
    if (keys.length > 0) {
      await r.del(...keys);
    }
  } while (cursor !== 0);
}
```

### Replace in-memory rate limiting in `middleware.ts`:
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from '@/lib/redis';

// Create rate limiters
const readLimiter = new Ratelimit({
  redis: getRedis()!,
  limiter: Ratelimit.slidingWindow(100, '1 m'),
});

const writeLimiter = new Ratelimit({
  redis: getRedis()!,
  limiter: Ratelimit.slidingWindow(20, '1 m'),
});
```

Remove the entire in-memory `rateLimitStore` Map and related functions.

### Update `.env.example`:
```
# Redis (Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

### Acceptance criteria:
- [ ] `lib/redis.ts` exists with cache helpers
- [ ] Rate limiting uses Redis (falls back gracefully without it)
- [ ] In-memory `rateLimitStore` Map is removed
- [ ] Rate limiting works across serverless instances
- [ ] Cache helpers work with TTL
- [ ] Build passes

---

## Task 3.3: Add caching to hot API endpoints

### Add Redis caching to these read-heavy endpoints:

| Endpoint | Cache Key | TTL | Invalidate On |
|----------|-----------|-----|---------------|
| GET /api/appointments | `appointments:{tenantId}:{date_range}` | 5 min | Create/Update/Delete appointment |
| GET /api/clients | `clients:{tenantId}:{page}:{filters}` | 10 min | Create/Update/Delete client |
| GET /api/services | `services:{tenantId}` | 30 min | Create/Update/Delete service |
| GET /api/providers | `providers:{tenantId}` | 30 min | Create provider |
| GET /api/resources | `resources:{tenantId}` | 30 min | Create resource |
| Dashboard data | `dashboard:{tenantId}` | 15 min | Any write operation |

### Pattern:
```typescript
import { getCached, invalidateCache } from '@/lib/redis';

// GET handler:
const cacheKey = `appointments:${tenantId}:${start}:${end}`;
const appointments = await getCached(cacheKey, 300, async () => {
  return db.collection('appointments').find({ tenant_id: tenantId, ... }).toArray();
});

// POST handler (after insert):
await invalidateCache(`appointments:${tenantId}:*`);
```

### Acceptance criteria:
- [ ] 6 endpoints use Redis caching
- [ ] Cache invalidation happens on mutations
- [ ] Fallback to direct DB query when Redis unavailable
- [ ] Build passes

---

## Task 3.4: Background job processing with QStash (or simple cron)

### Option A: Upstash QStash (recommended for Vercel)
```bash
npm install @upstash/qstash
```

### Option B: Vercel Cron (simpler, less flexible)
Create `vercel.json`:
```json
{
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/email-sync", "schedule": "*/5 * * * *" }
  ]
}
```

### Create cron/job endpoints:

**`app/api/cron/reminders/route.ts`:**
- Verify cron secret: `Authorization: Bearer {CRON_SECRET}`
- Find appointments needing reminders (24h ahead, not yet sent)
- Send reminders via email (using existing nodemailer or Resend)
- Mark as sent

**`app/api/cron/email-sync/route.ts`:**
- Verify cron secret
- Find tenants with active email integrations
- Sync emails for each (with timeout protection)
- Process in batches of 5 (not all at once)

### Update `.env.example`:
```
CRON_SECRET=  # Shared secret for cron job authentication
```

### Acceptance criteria:
- [ ] Reminder processing runs on schedule (not manual trigger)
- [ ] Email sync runs on schedule
- [ ] Cron endpoints verify secret (not publicly callable)
- [ ] Jobs have timeout protection
- [ ] Build passes

---

## Task 3.5: Error tracking with Sentry

### Install:
```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

### Configure:
- `sentry.client.config.ts` — Client-side error tracking
- `sentry.server.config.ts` — Server-side error tracking
- `sentry.edge.config.ts` — Edge runtime tracking
- Update `next.config.js` with Sentry webpack plugin

### Update `.env.example`:
```
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
```

### Acceptance criteria:
- [ ] Sentry SDK installed and configured
- [ ] Client-side errors captured
- [ ] Server-side errors captured
- [ ] Source maps uploaded for readable stack traces
- [ ] Build passes

---

## Task 3.6: Security headers and CORS

### Update `next.config.js`:
```javascript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://api.openai.com https://*.upstash.io;",
  },
];

module.exports = {
  // ... existing config
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
```

### Acceptance criteria:
- [ ] Security headers present on all responses
- [ ] CSP blocks inline scripts from unknown sources
- [ ] X-Frame-Options prevents clickjacking
- [ ] Build passes

---

## Task 3.7: Deployment configuration

### Create `vercel.json` (if using Vercel):
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "regions": ["fra1"],
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/email-sync", "schedule": "*/5 * * * *" }
  ]
}
```

### Update `.env.example` with ALL required variables:
```
# Database
MONGODB_URI=

# Auth
AUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Encryption
ENCRYPTION_KEY=

# Storage
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# AI
OPENAI_API_KEY=

# Email
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# Cron
CRON_SECRET=

# Error Tracking
SENTRY_DSN=

# Optional
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### Acceptance criteria:
- [ ] `vercel.json` exists with correct config
- [ ] `.env.example` has ALL required variables documented
- [ ] Build passes on `npm run build`

---

## Final Verification

```bash
npm run build && npx tsc --noEmit

# Verify no local file storage references:
grep -r "fs.writeFileSync\|fs.readFileSync\|UPLOAD_DIR" --include="*.ts" app/api/

# Verify Redis is used:
grep -r "getRedis\|getCached\|invalidateCache" --include="*.ts" lib/ app/api/ | wc -l

# Verify security headers:
grep -r "X-Frame-Options\|Content-Security-Policy" next.config.js
```

Commit:
```bash
git add -A && git commit -m "PHASE-03: Cloud storage, Redis cache, background jobs, deployment config"
```

---

## Execution Order (Chapter-by-Chapter, One-by-One)

Use this order for implementation and review:

1. Chapter 0: Benchmark baseline freeze
   - Capture clean baseline with benchmark switch enabled.
   - Record run ID in `STATUS.md` and `SESSION-IMPLEMENTATION-LOG.md`.
2. Chapter 1: Task 3.1 storage migration
3. Chapter 2: Task 3.2 Redis foundation + distributed rate limiting
4. Chapter 3: Task 3.3 hot endpoint caching
5. Chapter 4: Task 3.4 background jobs/cron
6. Chapter 5: Task 3.5 Sentry integration
7. Chapter 6: Task 3.6 security headers/CSP
8. Chapter 7: Task 3.7 deployment/env contract
9. Chapter 8: hotspot performance refactor pass
   - prioritize: `api.dashboard.7d`, `/dashboard`, `/calendar`, `/inbox`, `/api/clients` write path.
10. Chapter 9: benchmark compare + closeout docs

### Claude Review Gate (Required)
- Before coding each chapter:
  - Claude reviews scope + acceptance criteria for that chapter.
  - Confirm no regressions against Phase 2 tenancy/role rules.
- After completing each chapter:
  - Run `npm run typecheck` and `npm run build`.
  - Run relevant smoke/benchmark checks.
  - Claude reviews changed files before proceeding to next chapter.

### Baseline/Compare Contract
- Baseline run must be captured with benchmark switch:
  - `.env`: `BENCHMARK_MODE=true`
  - `.env`: `BENCHMARK_TOKEN=<secret>`
- Use:
  - `npm run bench:baseline`
  - `npm run bench:compare -- --against <baselineRunId>`
