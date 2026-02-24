# Email Integration Fix — Remove .env Fallback & Switch to Per-User DB Storage

## Summary

Fix a critical security bug where the app falls back to the developer's personal Yahoo
credentials (from `.env`) whenever a user/tenant has no email integration configured in
the database. Simultaneously migrate from per-tenant email scope to per-user, so each
owner and staff member can connect their own email account independently.

---

## The Bug

### Root Cause

`getYahooConfig()` in [lib/yahoo-mail.ts](lib/yahoo-mail.ts) has a silent fallback:

1. Tries to load credentials from MongoDB (`email_integrations` collection)
2. If nothing is found (or `tenantId` is missing), reads `YAHOO_EMAIL` / `YAHOO_APP_PASSWORD` from `.env`
3. Returns the developer's personal account — used for **every** user/tenant without their own config

### Secondary Bug

[app/api/yahoo/send/route.ts](app/api/yahoo/send/route.ts) calls `getYahooConfig(userId)`
without `tenantId`. Since `getEmailIntegrationConfig()` requires both, the DB lookup
always fails, so the route **always** uses `.env` credentials to send outbound email.

### Scope of the Fallback

| Call site | Falls back to .env? |
|-----------|---------------------|
| `lib/yahoo-mail.ts:getYahooConfig()` | **YES — the source of the problem** |
| `app/api/yahoo/sync/route.ts` | YES (calls `getYahooConfig`) |
| `app/api/yahoo/send/route.ts` | YES (missing `tenantId` → always falls back) |
| `app/api/conversations/[id]/messages/route.ts` | YES (calls `getYahooConfig`) |
| `lib/yahoo-sync-runner.ts:resolveYahooConfigByIntegrationId()` | **NO — correct, DB only** |
| `app/api/cron/email-sync/route.ts` | **NO — correct, DB only** |
| `app/api/jobs/email-sync/yahoo/route.ts` | **NO — correct, DB only** |

---

## Architecture Decision: Per-User Email Integrations

### Current (broken)
- Unique DB index: `{ tenant_id: 1, provider: 1 }` — one email per provider per **tenant**
- Only `owner` role can access email settings
- Upsert filter uses `{ tenant_id, provider }`

### Target (correct)
- Unique DB index: `{ user_id: 1, provider: 1 }` — one email per provider per **user**
- Both `owner` and `staff` can connect their own email account
- Upsert filter uses `{ user_id, provider }`
- Credential storage is unchanged (AES-256-GCM in MongoDB, already per-user via `user_id` field)

---

## Implementation Plan

### Step 1 — Remove `.env` fallback from `getYahooConfig()`
**File:** [lib/yahoo-mail.ts](lib/yahoo-mail.ts)

Replace the current function body with a DB-only lookup:

```typescript
export async function getYahooConfig(userId?: number, tenantId?: ObjectId): Promise<YahooConfig | null> {
  if (!userId || !tenantId) return null;
  try {
    const { getEmailIntegrationConfig } = await import('./email-integrations');
    const config = await getEmailIntegrationConfig(userId, tenantId, 'yahoo');
    if (config?.password) {
      return { email: config.email, password: config.password, appPassword: config.password };
    }
    return null;
  } catch (error) {
    const { logger } = await import('./logger');
    logger.warn('Failed to get Yahoo config from database', { error, userId });
    return null;
  }
}
```

Remove all references to `process.env.YAHOO_EMAIL`, `YAHOO_PASSWORD`, `YAHOO_APP_PASSWORD`.

---

### Step 2 — Fix upsert filter in `saveEmailIntegration()`
**File:** [lib/email-integrations.ts](lib/email-integrations.ts)

Change the upsert filter from per-tenant to per-user:

```typescript
// BEFORE (per-tenant):
filter: { tenant_id: tenantId, provider }

// AFTER (per-user):
filter: { user_id: userId, provider }
```

---

### Step 3 — MongoDB index migration script
**New file:** [scripts/migrate-email-integrations-per-user.js](scripts/migrate-email-integrations-per-user.js)

```js
const { MongoClient } = require('mongodb');
require('dotenv').config();

async function migrate() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();
  const col = db.collection('email_integrations');

  // Drop old per-tenant unique index
  try {
    await col.dropIndex('tenant_id_1_provider_1');
    console.log('Dropped old index: tenant_id_1_provider_1');
  } catch (e) {
    console.log('Old index not found (already dropped or never existed):', e.message);
  }

  // Create new per-user unique index
  await col.createIndex({ user_id: 1, provider: 1 }, { unique: true });
  console.log('Created new index: user_id_1_provider_1 (unique)');

  await client.close();
  console.log('Migration complete');
}

migrate().catch(console.error);
```

Run with: `node scripts/migrate-email-integrations-per-user.js`

---

### Step 4 — Open email settings to all roles
Remove `requireRole(role, 'owner')` from these routes (keep `getAuthUser()` — auth still required):

| File | Change |
|------|--------|
| [app/api/settings/email-integrations/route.ts](app/api/settings/email-integrations/route.ts) | Remove owner-only restriction |
| [app/api/settings/email-integrations/yahoo/route.ts](app/api/settings/email-integrations/yahoo/route.ts) | Remove owner-only restriction |
| [app/api/settings/email-integrations/[id]/route.ts](app/api/settings/email-integrations/%5Bid%5D/route.ts) | Remove owner-only restriction |
| [app/api/settings/email-integrations/[id]/test/route.ts](app/api/settings/email-integrations/%5Bid%5D/test/route.ts) | Remove owner-only restriction |
| [app/api/settings/email-integrations/[id]/fetch-last-email/route.ts](app/api/settings/email-integrations/%5Bid%5D/fetch-last-email/route.ts) | Remove owner-only restriction |

All queries are already scoped by `user_id` from the session — no data leakage risk.

---

### Step 5 — Fix missing `tenantId` in `/api/yahoo/send`
**File:** [app/api/yahoo/send/route.ts](app/api/yahoo/send/route.ts)

```typescript
// BEFORE (always falls back to .env):
const config = await getYahooConfig(userId);

// AFTER (uses DB, tenantId from getAuthUser()):
const config = await getYahooConfig(userId, tenantId);
```

---

### Step 6 — Use logged-in user's credentials when sending from conversation
**File:** [app/api/conversations/[id]/messages/route.ts](app/api/conversations/%5Bid%5D/messages/route.ts)

```typescript
// BEFORE (uses conversation creator's credentials):
const config = await getYahooConfig(Number(conversation.user_id), conversation.tenant_id);

// AFTER (uses the person hitting "Send"):
const config = await getYahooConfig(userId, tenantId); // from getAuthUser()
```

If `config` is `null`, return a clear 400 error:
```
"No email account connected. Go to Settings → Email to connect your Yahoo account."
```

---

### Step 7 — Remove deprecated `.env` vars
**File:** [.env](.env)

Remove or comment out:
```
YAHOO_EMAIL=...
YAHOO_APP_PASSWORD=...
YAHOO_PASSWORD=...
```

Keep empty placeholders in `.env.example` with note:
```
# DEPRECATED: email credentials are now stored per-user in MongoDB (encrypted AES-256-GCM)
# YAHOO_EMAIL=
# YAHOO_APP_PASSWORD=
```

`scripts/test-yahoo.js` and `scripts/test-yahoo-debug.js` may keep their env-var usage — dev-only tools, not production paths.

---

## What Does NOT Change

| Component | Status |
|-----------|--------|
| `resolveYahooConfigByIntegrationId()` | Already correct — DB only, no fallback |
| `syncYahooInboxForIntegration()` | Already correct — ID-based, no fallback |
| Cron job (`/api/cron/email-sync`) | Already correct — queries DB integrations only |
| Encryption (`lib/encryption.ts`) | Unchanged — AES-256-GCM |
| `email_integrations` collection fields | Unchanged — only the unique index changes |

---

## Files Modified Summary

| File | Change |
|------|--------|
| `lib/yahoo-mail.ts` | Remove `.env` fallback from `getYahooConfig()` |
| `lib/email-integrations.ts` | Change upsert filter to `{ user_id, provider }` |
| `app/api/settings/email-integrations/route.ts` | Remove `requireRole('owner')` |
| `app/api/settings/email-integrations/yahoo/route.ts` | Remove `requireRole('owner')` |
| `app/api/settings/email-integrations/[id]/route.ts` | Remove `requireRole('owner')` |
| `app/api/settings/email-integrations/[id]/test/route.ts` | Remove `requireRole('owner')` |
| `app/api/settings/email-integrations/[id]/fetch-last-email/route.ts` | Remove `requireRole('owner')` |
| `app/api/yahoo/send/route.ts` | Add `tenantId` to `getYahooConfig()` call |
| `app/api/conversations/[id]/messages/route.ts` | Use logged-in user's credentials for send |
| `.env` | Remove `YAHOO_EMAIL`, `YAHOO_APP_PASSWORD`, `YAHOO_PASSWORD` |

## New Files

| File | Purpose |
|------|---------|
| `scripts/migrate-email-integrations-per-user.js` | Drop per-tenant index, create per-user unique index |

---

## Verification Checklist

1. `node scripts/migrate-email-integrations-per-user.js` — runs without error
2. Remove `YAHOO_*` from `.env`, restart dev server (`npm run dev`)
3. Log in as `owner` → Settings → connect Yahoo → works
4. Log in as `staff` → Settings → connect Yahoo → works (was blocked before)
5. With no email connected, try to send from a conversation → clear error message shown, **not** developer's Yahoo account
6. Cron sync (`POST /api/cron/email-sync`) still processes only tenants with active DB integrations
7. `npx tsc --noEmit` — zero errors
