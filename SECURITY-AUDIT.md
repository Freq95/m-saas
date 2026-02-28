# Security Audit — D:\m-saas
**Date:** 2026-02-24
**Scope:** Email integration system, infrastructure, auth, database, dependencies
**Status:** 20 findings — 3 Critical · 7 High · 7 Medium · 3 Low

---

## How to Read This Report

Each finding includes:
- **Impact** — what an attacker can actually do
- **Location** — exact file + line
- **Fix** — concrete code change or configuration

Findings are ordered by real-world exploitability, not just theoretical severity.

---

## CRITICAL

---

### C-1 · TLS Certificate Validation Disabled — MITM on All Email Credentials

**Impact:** Any attacker on the same network path (ISP, VPN, cloud provider) can present a fake certificate, intercept the IMAP/SMTP handshake, and capture the user's Yahoo App Password in plaintext. Every email credential stored in the database is at risk.

**Locations:**
- [lib/yahoo-mail.ts](lib/yahoo-mail.ts) — lines ~157, ~376, ~424, ~457 — four separate connections

```typescript
// ALL four connections have this:
tlsOptions: { rejectUnauthorized: false },  // ← disables cert validation entirely
```

**Fix:** Remove the option entirely (Node.js defaults to `true`):
```typescript
// IMAP connections — remove tlsOptions or set:
tlsOptions: { rejectUnauthorized: true },

// SMTP (nodemailer) — remove the tls block entirely OR set:
tls: { rejectUnauthorized: true },
```

Yahoo's IMAP server (`imap.mail.yahoo.com:993`) and SMTP server (`smtp.mail.yahoo.com:587`) both use valid, CA-signed certificates. `rejectUnauthorized: false` is never needed here.

---

### C-2 · Webhook Endpoint Has Zero Authentication — Anyone Can Inject Emails

**Impact:** `POST /api/webhooks/email` accepts a `userId` from the request body and creates conversations/messages for that user with no verification. Any person on the internet can inject arbitrary email conversations into any user's inbox by guessing a numeric `userId`.

**Location:** [app/api/webhooks/email/route.ts](app/api/webhooks/email/route.ts)

```typescript
// Line ~12 — userId comes directly from attacker-controlled request body
const { userId, from, to, subject, text, html } = body;
```

**Fix:** Add HMAC-SHA256 signature verification:
```typescript
import crypto from 'crypto';

function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// In POST handler:
const rawBody = await request.text();
const sig = request.headers.get('x-webhook-signature') ?? '';
if (!verifyWebhookSignature(rawBody, sig)) {
  return createErrorResponse('Unauthorized', 401);
}
```

Until a real email provider (Gmail, Outlook) is integrated, this endpoint should be disabled or protected behind the `CRON_SECRET` at minimum.

---

### C-3 · Missing HTTP Security Headers — XSS, Clickjacking, Protocol Downgrade

**Impact:** Without a Content Security Policy, any XSS vulnerability (injected script in email content, for example) runs without restriction and can steal session tokens. Without X-Frame-Options, the app can be embedded in iframes for clickjacking. Without HSTS, browsers allow downgrade from HTTPS to HTTP.

**Location:** [next.config.js](next.config.js) — no `headers()` function defined

**Fix:** Add to `next.config.js`:
```javascript
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",  // tighten after audit
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "connect-src 'self'",
            "frame-ancestors 'none'",
          ].join('; '),
        },
      ],
    },
  ];
},
```

---

## HIGH

---

### H-1 · DATABASE_URL Exposed to Browser via next.config.js

**Impact:** The MongoDB connection string (including credentials) is bundled into client-side JavaScript and visible to anyone who views page source or the network tab.

**Location:** [next.config.js](next.config.js)

```javascript
env: {
  DATABASE_URL: process.env.DATABASE_URL,  // ← sent to browser
}
```

**Fix:** Delete that `env` block entirely. Server-side API routes automatically have access to all env vars. Only variables prefixed `NEXT_PUBLIC_` should go in the `env` block, and database credentials should never be `NEXT_PUBLIC_`.

---

### H-2 · Hardcoded Encryption Salt Weakens AES-256-GCM Key Derivation

**Impact:** The encryption key is derived from `ENCRYPTION_KEY` using `scryptSync` with a static, public salt (`'vecinu-saas-salt-v1'`). If `ENCRYPTION_KEY` is a short passphrase (not a 32-byte hex string), an attacker who has the source code can precompute the derived key offline. All stored email credentials would then be decryptable.

**Location:** [lib/encryption.ts](lib/encryption.ts) line ~11

```typescript
const KEY_SALT = 'vecinu-saas-salt-v1';  // ← hardcoded, public, predictable
```

**Fix (two options, pick one):**

Option A — Require `ENCRYPTION_KEY` to already be a 32-byte hex string (no derivation needed):
```typescript
export function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(key, 'hex');  // no derivation needed
}
```

Option B — Store a random salt per-credential alongside the encrypted value:
```typescript
// Format: randomSalt(hex):iv:tag:ciphertext
// Include a unique random salt per encrypt() call, not a global constant
```

Option A is simpler and correct if `ENCRYPTION_KEY` is already a strong random hex string (which `.env.example` instructs).

---

### H-3 · No Encryption Key Rotation — Single Point of Compromise

**Impact:** If `ENCRYPTION_KEY` is ever exposed (leaked `.env`, compromised server, insider threat), every user's stored email credentials can be decrypted. There is no way to rotate the key without losing access to all stored credentials.

**Location:** [lib/encryption.ts](lib/encryption.ts)

**Fix:** Prefix encrypted values with a key version identifier:
```typescript
// Store as:  v1:iv:tag:ciphertext
// On decrypt: read version → select correct key → decrypt

const KEYS: Record<string, string> = {
  v1: process.env.ENCRYPTION_KEY_V1 ?? '',
  v2: process.env.ENCRYPTION_KEY_V2 ?? '',  // add when rotating
};

export function encrypt(text: string, version = 'v2'): string {
  const key = Buffer.from(KEYS[version], 'hex');
  // ... encrypt ...
  return `${version}:${iv}:${tag}:${encrypted}`;
}

export function decrypt(stored: string): string {
  const [version, iv, tag, encrypted] = stored.split(':');
  const key = Buffer.from(KEYS[version], 'hex');
  // ... decrypt with correct key ...
}
```

When rotating: re-encrypt all records with the new key, then retire the old one.

---

### H-4 · BENCHMARK_MODE Bypasses All Rate Limiting

**Impact:** If `BENCHMARK_TOKEN` leaks (committed to git, exposed in logs, etc.), an attacker can include `x-benchmark-token: <token>` in any request and bypass all rate limiting globally — enabling brute force, credential stuffing, and spam.

**Location:** [middleware.ts](middleware.ts) lines ~191–228

```typescript
const benchmarkBypassEnabled = process.env.BENCHMARK_MODE === 'true';
// ...
if (... && !benchmarkBypass) {
  // rate limiting — skipped if benchmarkBypass is true
```

**Fix:** Remove benchmark bypass from production code entirely. For performance testing, use a staging environment or a dedicated test runner that doesn't hit production. At minimum, ensure `BENCHMARK_MODE` is never `true` on production and add an assertion:
```typescript
if (process.env.NODE_ENV === 'production' && process.env.BENCHMARK_MODE === 'true') {
  throw new Error('BENCHMARK_MODE must not be enabled in production');
}
```

---

### H-5 · MongoDB ReDoS via Regex Email Lookup

**Impact:** A crafted email address (e.g., very long string with repeated characters) can cause catastrophic backtracking in Node.js's regex engine, hanging the sync worker process for seconds or minutes — effective DoS against the email sync pipeline.

**Location:** [lib/yahoo-sync-runner.ts](lib/yahoo-sync-runner.ts) lines ~192–196

```typescript
const escapedEmail = emailAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const existingClient = await db.collection('clients').findOne({
  email: { $regex: `^${escapedEmail}$`, $options: 'i' },  // ← ReDoS risk
});
```

**Fix:** Store emails lowercased and use exact `$eq` matching with a case-insensitive collation on the index instead:
```typescript
// Query (no regex):
const existingClient = await db.collection('clients').findOne({
  user_id: userId,
  tenant_id: tenantId,
  email: emailAddress.toLowerCase(),
});
// Index on collection: { email: 1 } with collation { locale: 'en', strength: 2 }
```

---

### H-6 · Console.log Leaks PII to Production Logs

**Impact:** Email sender addresses, subjects, and error details are written to `console.log` / `console.error`. On Vercel and most cloud platforms, these appear in the deployment logs, which are accessible to anyone with project access. This is a GDPR compliance issue.

**Location:** [lib/yahoo-mail.ts](lib/yahoo-mail.ts) — approximately 12 `console.log`/`console.error` calls

```typescript
console.log('Yahoo IMAP: Parsed email from:', emailData.from, 'subject:', emailData.subject);
console.error('Yahoo IMAP search error:', err);
// etc.
```

**Fix:** Replace every `console.*` in this file with the project logger (`lib/logger.ts`), which is already structured and can be filtered by log level:
```typescript
import { logger } from './logger';
logger.info('Parsed email', { uid: emailData.uid });          // no PII
logger.warn('Skipped email — missing from field', { uid });
logger.error('IMAP search failed', err as Error, { userId });
```

Do not log `from`, `subject`, or email body content at any log level.

---

### H-7 · Cron Secret Uses String Equality — Timing Attack

**Impact:** By measuring response time differences, an attacker can determine the correct `CRON_SECRET` character by character. The attack is slow but fully automated and requires no special network position.

**Location:** [lib/cron-auth.ts](lib/cron-auth.ts) line ~9

```typescript
return authHeader === `Bearer ${secret}`;  // ← string equality, timing-safe required
```

**Fix:**
```typescript
import crypto from 'crypto';

export function hasValidCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token.padEnd(secret.length)),
      Buffer.from(secret)
    );
  } catch {
    return false;
  }
}
```

---

## MEDIUM

---

### M-1 · ZodError Validation Details Exposed to API Clients

**Impact:** When input validation fails, full Zod error messages are returned (field names, min/max constraints, allowed values). This gives attackers a precise map of the API's expected input format.

**Location:** [lib/error-handler.ts](lib/error-handler.ts) lines ~46–51

```typescript
if (error.name === 'ZodError') {
  return createErrorResponse('Invalid input', 400, error.message);  // ← full details
}
```

**Fix:** Strip internal details from client responses:
```typescript
if (error.name === 'ZodError') {
  const safeErrors = (error as ZodError).issues.map(i => ({
    field: i.path.join('.'),
    message: i.message,
  }));
  return createErrorResponse('Invalid input', 400, safeErrors);
  // Never include .code, .expected, .received from ZodIssue
}
```

---

### M-2 · No Rate Limiting on Email Send Endpoint

**Impact:** A compromised account (or the developer's account via the `.env` bug that was just fixed) can spam unlimited outbound emails through Yahoo's SMTP, burning the account's sending reputation and potentially triggering Yahoo's abuse systems, which would block the entire integration.

**Location:** [app/api/yahoo/send/route.ts](app/api/yahoo/send/route.ts)

**Fix:** Add a dedicated rate limiter before the send logic:
```typescript
const emailSendLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),  // 20 outbound emails per hour per user
  prefix: 'rl:email:send',
});

// In POST handler, before sending:
const { success } = await emailSendLimit.limit(String(userId));
if (!success) return createErrorResponse('Rate limit exceeded', 429);
```

---

### M-3 · No Audit Log for Email Credential Changes

**Impact:** If a staff member's account is compromised and an attacker adds or replaces an email integration, there is no record of when it happened or from what IP. This makes incident response and forensics impossible.

**Location:** [app/api/settings/email-integrations/yahoo/route.ts](app/api/settings/email-integrations/yahoo/route.ts) and [app/api/settings/email-integrations/[id]/route.ts](app/api/settings/email-integrations/%5Bid%5D/route.ts)

**Fix:** Write to the `audit_logs` collection (already exists per migration files) on create and delete:
```typescript
await db.collection('audit_logs').insertOne({
  actor_user_id: userId,
  tenant_id: tenantId,
  action: 'email_integration.created',  // or .deleted
  target_type: 'email_integration',
  target_id: integration.id,
  metadata: { provider: 'yahoo', email: integration.email },
  ip: request.headers.get('x-forwarded-for') ?? 'unknown',
  created_at: new Date().toISOString(),
});
```

---

### M-4 · Null tenantId Allowed in Cron Job — Potential Isolation Bypass

**Impact:** If an `email_integrations` record has a null `tenant_id` (data corruption, migration issue), the cron job passes `null` to the sync function. `resolveYahooConfigByIntegrationId` queries without `tenant_id` filter when it's undefined, potentially syncing emails into the wrong tenant context.

**Location:** [app/api/cron/email-sync/route.ts](app/api/cron/email-sync/route.ts) lines ~63–68

**Fix:** Filter out integrations with null tenantId before queuing:
```typescript
const integrationTargets = activeYahooIntegrations
  .map((doc: any) => ({
    integrationId: Number(doc.id),
    tenantId: doc.tenant_id ? String(doc.tenant_id) : null,
  }))
  .filter((t) => Number.isInteger(t.integrationId) && t.integrationId > 0 && t.tenantId !== null);
// Log and alert on any filtered-out records
```

---

### M-5 · Orphaned Attachments in Cloud Storage on Integration Delete

**Impact:** When a user deletes their email integration, all synced email attachments remain in Cloudflare R2 indefinitely. This is a privacy risk (GDPR right to erasure) and an ongoing cost.

**Location:** [app/api/settings/email-integrations/[id]/route.ts](app/api/settings/email-integrations/%5Bid%5D/route.ts) — no storage cleanup

**Fix:** On delete, queue a background cleanup job or delete inline:
```typescript
// After deleting integration from DB:
const attachments = await db.collection('message_attachments')
  .find({ user_id: userId, tenant_id: tenantId })
  .toArray();

const storage = getStorageProvider();
for (const att of attachments) {
  await storage.delete(att.storage_key).catch(() => {/* log, don't fail */});
}
await db.collection('message_attachments').deleteMany({ user_id: userId, tenant_id: tenantId });
```

---

### M-6 · In-Memory Rate Limit Store Is Unbounded

**Impact:** When Upstash Redis is unavailable, rate limiting falls back to a `Map()` in process memory with no TTL cleanup. Over time this leaks memory. On Vercel serverless (where each cold start is isolated), it also means rate limits don't persist across requests.

**Location:** [middleware.ts](middleware.ts) lines ~22, ~98–112

**Fix — fail closed:** When Redis is unavailable, reject requests with 503 instead of allowing them through:
```typescript
if (!redis) {
  return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
}
```

Or implement a bounded LRU cache with `max` size and TTL for the fallback store.

---

### M-7 · Logger Does Not Redact Sensitive Fields

**Impact:** If any code path logs an object that contains `password`, `token`, or `apiKey` (by mistake or during debugging), the logger will write it in plaintext to stdout without warning.

**Location:** [lib/logger.ts](lib/logger.ts) line ~35

**Fix:** Add a redaction step before serializing the context object:
```typescript
const REDACT_KEYS = new Set(['password', 'token', 'apiKey', 'secret', 'encrypted_password', 'appPassword']);

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, REDACT_KEYS.has(k) ? '[REDACTED]' : v])
  );
}
```

---

## LOW

---

### L-1 · Dependency Chain Vulnerabilities (Dev Dependencies)

**Impact:** `eslint@8` pulls in `minimatch` and `ajv` versions with ReDoS vulnerabilities. These are dev-only and don't affect the production runtime, but they do affect the build environment and CI pipeline.

**Location:** [package.json](package.json)

**Fix:** Update eslint to v9+ and `@typescript-eslint/*` to latest:
```bash
npm install --save-dev eslint@latest @typescript-eslint/eslint-plugin@latest @typescript-eslint/parser@latest
```

Run `npm audit` after to confirm resolution.

---

### L-2 · No Account Lockout on Failed Email Connection Tests

**Impact:** The `/api/settings/email-integrations/[id]/test` endpoint tests IMAP credentials on demand. Without lockout, an attacker with a valid session can try unlimited App Password guesses (if they know a user's email address but not their App Password).

**Location:** [app/api/settings/email-integrations/[id]/test/route.ts](app/api/settings/email-integrations/%5Bid%5D/test/route.ts)

**Fix:** Apply a strict rate limit to this endpoint:
```typescript
const testLimit = Ratelimit.slidingWindow(5, '10 m');  // 5 attempts per 10 minutes
```

---

### L-3 · CORS Policy Not Explicitly Configured

**Impact:** Next.js does not expose API routes to cross-origin requests by default, so this is low risk. But if any API route is later needed from a different origin, the absence of an explicit CORS policy could lead to an overly permissive ad-hoc configuration.

**Location:** No `next.config.js` CORS configuration

**Fix:** Document the intended CORS policy in a comment in `next.config.js`, and if any route needs cross-origin access, use the `headers()` function with explicit `Access-Control-Allow-Origin` values (never `*` for authenticated endpoints).

---

## Summary Table

| ID | Severity | Issue | File | Fix Complexity |
|----|----------|-------|------|----------------|
| C-1 | **CRITICAL** | `rejectUnauthorized: false` — MITM on email credentials | `lib/yahoo-mail.ts` | 1 line |
| C-2 | **CRITICAL** | Webhook endpoint — no auth, anyone can inject emails | `api/webhooks/email/route.ts` | Medium |
| C-3 | **CRITICAL** | Missing HTTP security headers (CSP, HSTS, X-Frame-Options) | `next.config.js` | Small |
| H-1 | **HIGH** | `DATABASE_URL` exposed to browser in next.config | `next.config.js` | 1 line |
| H-2 | **HIGH** | Hardcoded encryption salt weakens key derivation | `lib/encryption.ts` | Small |
| H-3 | **HIGH** | No encryption key rotation support | `lib/encryption.ts` | Medium |
| H-4 | **HIGH** | Benchmark bypass defeats all rate limiting | `middleware.ts` | Small |
| H-5 | **HIGH** | ReDoS via regex in email matching | `lib/yahoo-sync-runner.ts` | Small |
| H-6 | **HIGH** | `console.log` leaks PII (email addresses, subjects) | `lib/yahoo-mail.ts` | Small |
| H-7 | **HIGH** | Cron secret uses string `===` — timing attack | `lib/cron-auth.ts` | Small |
| M-1 | MEDIUM | ZodError details exposed to API clients | `lib/error-handler.ts` | Small |
| M-2 | MEDIUM | No rate limit on email send endpoint | `api/yahoo/send/route.ts` | Small |
| M-3 | MEDIUM | No audit log for credential changes | settings routes | Small |
| M-4 | MEDIUM | Null tenantId in cron — potential isolation bypass | `api/cron/email-sync/route.ts` | 1 line |
| M-5 | MEDIUM | Orphaned attachments on integration delete (GDPR) | settings `[id]/route.ts` | Medium |
| M-6 | MEDIUM | In-memory rate limit fallback is unbounded | `middleware.ts` | Small |
| M-7 | MEDIUM | Logger doesn't redact sensitive fields | `lib/logger.ts` | Small |
| L-1 | Low | Dev dependency ReDoS (eslint chain) | `package.json` | npm update |
| L-2 | Low | No lockout on connection test endpoint | settings test route | Small |
| L-3 | Low | CORS policy undocumented | `next.config.js` | Comment only |

---

## Remediation Order

### This week (data can be actively stolen)
1. **C-1** — `rejectUnauthorized: true` everywhere in yahoo-mail.ts
2. **H-1** — Remove `DATABASE_URL` from next.config.js env block
3. **C-3** — Add security headers to next.config.js
4. **C-2** — Disable or secure the webhook endpoint
5. **H-4** — Remove benchmark bypass from production

### Next week
6. **H-6** — Replace console.log with logger (no PII)
7. **H-7** — timingSafeEqual for cron secret
8. **H-5** — Replace regex email lookup with `$eq`
9. **M-4** — Filter null tenantId in cron
10. **M-2** — Rate limit email send endpoint

### This month
11. **H-2 + H-3** — Fix salt + add key rotation versioning
12. **M-1** — Sanitize ZodError responses
13. **M-3** — Audit logging for credential changes
14. **M-5** — Cleanup attachments on integration delete
15. **M-6 + M-7** — Rate limit fallback + logger redaction

---

## What Is Already Secure

- AES-256-GCM encryption with random IV per credential — correct algorithm, correct implementation
- Auth context (`getAuthUser`) validates user, tenant, and membership status on every request
- Credential storage in MongoDB — no plaintext passwords anywhere in the database
- `resolveYahooConfigByIntegrationId` — DB-only, no env fallback (the cron path is safe)
- CSRF protection on mutating routes — present via existing middleware
- Tenant isolation on all queries — `tenant_id` + `user_id` scoping enforced
- Rate limiting architecture — Upstash Redis with sliding window (when Redis is up)
- Input validation with Zod on all API routes
- Numeric ID validation in route parameters

---

## Key Rotation Runbook

Use this runbook only when rotating encryption keys (incident response or scheduled key lifecycle event).

1. Provision a new key version:
   - Generate a new 64-char hex key.
   - Add `ENCRYPTION_KEY_V2` (or next version) to environment.
   - Keep `ENCRYPTION_KEY` / `ENCRYPTION_KEY_V1` active for read compatibility during transition.

2. Deploy application code with versioned encryption support:
   - New writes should use the current active key version prefix (for example `v2:iv:tag:ciphertext`).
   - Existing records continue to decrypt via backward-compatible version handling.

3. Run credential re-encryption backfill as part of the rotation event:
   - Read each encrypted credential.
   - Decrypt with existing versioned logic.
   - Re-encrypt with the new active key version.
   - Persist updated values atomically.

4. Verify:
   - Connection test succeeds for representative integrations.
   - No decrypt failures in logs.
   - Sample records show new version prefix.

5. Retire old key:
   - Remove old key env var only after backfill is complete and verified.

### Important Operational Note

Do **not** run encryption backfill proactively when no key rotation is happening.
Backward compatibility already supports legacy unversioned payloads, so a proactive rewrite adds production risk without immediate security gain.
