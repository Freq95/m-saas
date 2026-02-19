# PHASE 0: Emergency Fixes

**Priority:** CRITICAL — Do this FIRST before anything else
**Estimated effort:** 1 day
**Dependencies:** None
**Commit message:** `PHASE-00: Remove destructive functions, fix encryption, add ownership checks`

---

## Context

Read `REVIEW-phase3-5.md` sections 1.1-1.5 for detailed explanations of WHY each fix is critical.

**TL;DR:** The codebase has functions that can wipe entire database collections, a hardcoded encryption key fallback, and DELETE routes that don't check who owns the data. These must be fixed before any other work.

---

## Task 0.1: Remove `writeMongoCollection()` destructive function

**File:** `lib/db/mongo.ts`
**Risk:** This function does `deleteMany({})` then `insertMany()`. If called with empty array, entire collection is wiped.

### Instructions:
1. Open `lib/db/mongo.ts`
2. Find the `writeMongoCollection()` function (does `deleteMany({})` followed by `insertMany()`)
3. **DELETE the entire function**
4. Search the entire codebase for any imports/calls to `writeMongoCollection` — there should be none in active API routes (only in scripts). If any exist, replace with individual CRUD operations.
5. Run `npm run build` to verify nothing breaks

### Acceptance criteria:
- [x] `writeMongoCollection` function no longer exists in `lib/db/mongo.ts`
- [x] No file imports or calls `writeMongoCollection`
- [x] Build passes

---

## Task 0.2: Remove `getMongoData()` full-scan cache system

**File:** `lib/db/mongo.ts`
**Risk:** Loads ALL documents from ALL 17 collections into memory on every cache miss. Unusable at scale.

### Instructions:
1. In `lib/db/mongo.ts`, find and **DELETE**:
   - The `mongoCache` Map variable
   - The `CACHE_TTL` constant
   - The `getMongoData()` function
   - The `invalidateMongoCache()` function
   - Any related type definitions (`CacheEntry`, etc.)
2. Search the ENTIRE codebase for `invalidateMongoCache` calls — there are ~27 files that call it. **Remove every call.** These are no-op overhead since API routes already use direct MongoDB queries.
3. Search for `getMongoData` calls. If any API routes use it (check `lib/email/sync.ts`, `scripts/`), replace with direct targeted MongoDB queries.
4. Run `npm run build` to verify nothing breaks

### Files that call `invalidateMongoCache` (remove the calls from ALL of these):
```
lib/client-matching.ts
lib/email-integrations.ts
lib/google-calendar.ts
lib/reminders.ts
app/api/clients/route.ts
app/api/clients/[id]/route.ts
app/api/clients/[id]/files/route.ts
app/api/clients/[id]/files/[fileId]/route.ts
app/api/clients/[id]/notes/route.ts
app/api/appointments/route.ts
app/api/appointments/[id]/route.ts
app/api/conversations/route.ts
app/api/conversations/[id]/route.ts
app/api/conversations/[id]/read/route.ts
app/api/conversations/[id]/messages/route.ts
app/api/conversations/[id]/attachments/[attachmentId]/save/route.ts
app/api/conversations/[id]/images/save/route.ts
app/api/services/route.ts
app/api/services/[id]/route.ts
app/api/tasks/route.ts
app/api/tasks/[id]/route.ts
app/api/reminders/route.ts
app/api/reminders/[id]/route.ts
app/api/webhooks/email/route.ts
app/api/yahoo/sync/route.ts
```

### Acceptance criteria:
- [x] `getMongoData()` function no longer exists
- [x] `invalidateMongoCache()` function no longer exists
- [x] Zero references to either function in the entire codebase
- [x] `mongoCache` variable removed
- [x] Build passes

---

## Task 0.3: Fix encryption key fallback

**File:** `lib/encryption.ts`
**Risk:** Falls back to hardcoded `'default-insecure-key-change-in-production'` with static salt `'salt'`. Anyone with source code access can decrypt all stored credentials.

### Instructions:
1. Open `lib/encryption.ts`
2. Find the `getEncryptionKey()` function
3. Replace the fallback with a hard crash:

```typescript
export function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  return crypto.scryptSync(key, 'vecinu-saas-salt-v1', KEY_LENGTH);
}
```

4. Also improve the static salt from `'salt'` to something unique (like `'vecinu-saas-salt-v1'`). NOTE: If there is existing encrypted data in the database, changing the salt will make it undecryptable. Check if `email_integrations` collection has any encrypted data first. If yes, keep the old salt OR write a migration that re-encrypts with the new salt.
5. Create/update `.env.example` to include:
```
# Required. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=
```

### Acceptance criteria:
- [x] No hardcoded fallback key in `lib/encryption.ts`
- [x] Application crashes with clear error message if `ENCRYPTION_KEY` not set
- [x] `.env.example` documents the variable
- [x] Build passes

---

## Task 0.4: Add ownership checks to DELETE and PATCH routes

**Risk:** Any user can delete/modify any other user's data by guessing the numeric ID. Example: `DELETE /api/appointments/42` deletes appointment 42 regardless of who owns it.

### Instructions:

For EACH of these route files, find the DELETE and PATCH handlers and add a `user_id` check to the MongoDB query:

**Files to fix:**
1. `app/api/appointments/[id]/route.ts` — DELETE and PATCH
2. `app/api/clients/[id]/route.ts` — DELETE and PATCH
3. `app/api/tasks/[id]/route.ts` — DELETE and PATCH
4. `app/api/services/[id]/route.ts` — DELETE and PATCH
5. `app/api/reminders/[id]/route.ts` — DELETE and PATCH
6. `app/api/conversations/[id]/route.ts` — PATCH
7. `app/api/clients/[id]/files/[fileId]/route.ts` — DELETE
8. `app/api/clients/[id]/notes/route.ts` — any mutation

**Pattern — BEFORE (broken):**
```typescript
await db.collection('appointments').deleteOne({ id: appointmentId });
```

**Pattern — AFTER (fixed):**
```typescript
// For now, extract userId from query params (will be replaced with session in Phase 1)
const url = new URL(request.url);
const userId = parseInt(url.searchParams.get('userId') || '1');

const result = await db.collection('appointments').deleteOne({
  id: appointmentId,
  user_id: userId,  // ← Ownership check
});

if (result.deletedCount === 0) {
  return createErrorResponse('Not found or not authorized', 404);
}
```

Apply the same pattern to PATCH operations — add `user_id` to the query filter, not just the update body.

**Note:** This is a temporary fix. In Phase 1 (auth), `userId` will come from the session instead of query params. But adding the filter NOW prevents cross-user data access even in the current state.

### Acceptance criteria:
- [x] ALL 8 route files have `user_id` in their DELETE/PATCH query filters
- [x] Deleting/updating a record that belongs to a different user returns 404
- [x] Build passes

---

## Task 0.5: Clean up dead code

### Instructions:
1. Delete the file `nul` in the project root (Windows artifact)
2. Check if `data/data.json` exists — if it does, check if anything imports it. If nothing uses it, delete it.
3. Check `lib/db/storage-data.ts` — if it's only used by the now-deleted `getMongoData()`, delete it too
4. Remove any unused imports that result from the above changes

### Acceptance criteria:
- [x] `nul` file deleted
- [x] No orphaned dead code files
- [x] Build passes
- [x] `npx tsc --noEmit` passes with no errors

---

## Final Verification

Run:
```bash
npm run build && npx tsc --noEmit
```

Then grep to confirm cleanup:
```bash
# Should return 0 results (excluding review/plan files):
grep -r "writeMongoCollection" --include="*.ts" --include="*.tsx" lib/ app/
grep -r "getMongoData" --include="*.ts" --include="*.tsx" lib/ app/
grep -r "invalidateMongoCache" --include="*.ts" --include="*.tsx" lib/ app/
grep -r "default-insecure-key" --include="*.ts" --include="*.tsx" lib/ app/
```

When all checks pass, commit:
```bash
git add -A && git commit -m "PHASE-00: Remove destructive functions, fix encryption, add ownership checks"
```
