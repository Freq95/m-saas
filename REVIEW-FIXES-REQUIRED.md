# Code Review Fixes Required

**Reviewer:** Claude (Opus 4.6)
**Date:** 2026-02-23
**Scope:** Sections 27-34 of SESSION-IMPLEMENTATION-LOG.md
**Verdict:** ~~REJECT — Fix all Critical and High issues before shipping~~

## ✅ RESOLVED — Section 35 (2026-02-23)

All 12 fixes implemented and verified by Claude review.
- 5 Critical: PASS
- 4 High: PASS
- 3 Medium: PASS

**Build required before shipping:** `npm run typecheck && npm run build`

---

## How to Use This Document

Each fix has:
- **File(s)** to modify
- **What's wrong** (current code)
- **What to do** (exact fix)
- **Why it matters**

After fixing ALL items marked Critical and High, run `npm run typecheck && npm run build` and confirm both pass. Then update SESSION-IMPLEMENTATION-LOG.md with a new section documenting the fixes.

---

## CRITICAL FIXES (Must fix — blocking deployment)

### FIX 1: Remove hardcoded `userId: 1` in client profile note creation

**File:** `app/clients/[id]/ClientProfileClient.tsx` line 174

**Current (BROKEN):**
```typescript
body: JSON.stringify({ userId: 1, content: noteContent }),
```

**Fix:**
```typescript
body: JSON.stringify({ content: noteContent }),
```

**Also fix the validation schema that FORCES this hardcode:**

**File:** `lib/validation.ts` — find `createNoteSchema`

**Current (BROKEN):**
```typescript
export const createNoteSchema = z.object({
  userId: z.number().int().positive(),
  content: z.string().min(1, 'Note content is required').max(5000),
});
```

**Fix:**
```typescript
export const createNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required').max(5000),
});
```

**Also audit** `lib/validation.ts` for any OTHER schemas that have `userId` fields. Remove ALL of them. The server ALWAYS derives userId from `getAuthUser()`. Schemas should never accept userId from the client. Specifically check:
- `createClientSchema` — remove `userId` if present (likely `.optional()`)
- `createServiceSchema` — remove `userId` if present (likely `.optional()`)
- Any other schema with a `userId` field

**Why:** Every note gets attributed to user 1 regardless of who's logged in. The validation schema *requires* userId, which is why the client sends `userId: 1` — it would fail validation otherwise. The server ignores it and uses `getAuthUser()`, but the schema forces the client to send it. Remove the field from both places.

**Verify:** After fixing, create a note as a non-admin user. Check the database to confirm the note's userId matches the logged-in user, not 1.

---

### FIX 2: Fix client name-only dedup (data integrity risk)

**File:** `lib/client-matching.ts` — the `findOrCreateClient()` function (around lines 76-110)

**Current (DANGEROUS):**
The function matches clients by normalized name only:
```typescript
const normalizedNameKey = normalizeNameForCompare(name);
const byExpr = await db.collection('clients').findOne({
  tenant_id: tenantId,
  user_id: userId,
  deleted_at: { $exists: false },
  name: { $type: 'string' },
  $expr: {
    $eq: [
      { $trim: { input: { $toLower: '$name' } } },
      normalizedNameKey,
    ],
  },
}, { sort: { last_activity_date: -1, updated_at: -1, created_at: -1 } });
```

If two different patients are both named "Ion Popescu", the second one silently reuses the first client's record. Appointments, billing, and medical history get mixed.

**Fix — two changes needed:**

**Change A: In `findOrCreateClient()`, require email OR phone match when name matches multiple clients:**

```typescript
// Step 1: Find ALL clients matching the normalized name (not just one)
const nameMatches = await db.collection('clients').find({
  tenant_id: tenantId,
  user_id: userId,
  deleted_at: { $exists: false },
  name: { $type: 'string' },
  $expr: {
    $eq: [
      { $trim: { input: { $toLower: '$name' } } },
      normalizedNameKey,
    ],
  },
}).sort({ last_activity_date: -1, updated_at: -1, created_at: -1 }).toArray();

// Step 2: If exactly one match, use it (safe — unique name in this tenant)
if (nameMatches.length === 1) {
  return normalizeClientDoc(nameMatches[0]);
}

// Step 3: If multiple matches, try to disambiguate by email or phone
if (nameMatches.length > 1) {
  // Try email match first
  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const emailMatch = nameMatches.find(c =>
      c.email && c.email.trim().toLowerCase() === normalizedEmail
    );
    if (emailMatch) return normalizeClientDoc(emailMatch);
  }

  // Try phone match
  if (phone) {
    const normalizedPhone = phone.replace(/\s+/g, '');
    const phoneMatch = nameMatches.find(c =>
      c.phone && c.phone.replace(/\s+/g, '') === normalizedPhone
    );
    if (phoneMatch) return normalizeClientDoc(phoneMatch);
  }

  // Multiple name matches but no email/phone to disambiguate
  // CREATE A NEW CLIENT — safer than guessing which "Ion Popescu" this is
  // The user can merge duplicates later, but we can't un-merge mixed records
}

// Step 4: No matches at all — create new client
```

**Change B: In the appointment modal (`CreateAppointmentModal.tsx`), show ALL matching clients in suggestions, not just one:**

When fetching client suggestions, ensure the API returns multiple results for the same name. The modal already shows a suggestion list — just make sure `limit: '6'` returns all name matches, not just the most recent one.

**Why:** "Ion Popescu" is like "John Smith" in Romania. A dental clinic WILL have multiple patients with the same name. Matching by name only silently merges their records. This is a data integrity bug that corrupts medical/billing history and is impossible to undo without manual database intervention.

---

### FIX 3: Fix rate-limit identity fallback to IP on malformed tokens

**File:** `middleware.ts` — the `getRateLimitIdentifier()` function

**Current (FRAGILE):**
```typescript
const tenantId = tokenObj && typeof tokenObj.tenantId === 'string' ? tokenObj.tenantId : '';
const userId = tokenObj && typeof tokenObj.id === 'string'
  ? tokenObj.id
  : tokenObj && typeof tokenObj.sub === 'string'
    ? tokenObj.sub
    : '';

if (tenantId && userId) {
  return withRedisPrefix(`ratelimit:tenant:${tenantId}:user:${userId}`);
}
if (userId) {
  return withRedisPrefix(`ratelimit:user:${userId}`);
}
return withRedisPrefix(`ratelimit:ip:${getClientIdentifier(request)}`);
```

If token.id is missing (empty string), it falls through to IP-based limiting. Multiple users behind the same VPN/office share one rate-limit bucket. This already caused a production 429 incident.

**Fix:**
```typescript
const tenantId = tokenObj && typeof tokenObj.tenantId === 'string' && tokenObj.tenantId
  ? tokenObj.tenantId
  : null;
const userId = tokenObj && typeof tokenObj.id === 'string' && tokenObj.id
  ? tokenObj.id
  : tokenObj && typeof tokenObj.sub === 'string' && tokenObj.sub
    ? tokenObj.sub
    : null;

// Prefer tenant+user scoped key
if (tenantId && userId) {
  return withRedisPrefix(`ratelimit:tenant:${tenantId}:user:${userId}`);
}

// Fallback to user-only key
if (userId) {
  return withRedisPrefix(`ratelimit:user:${userId}`);
}

// For unauthenticated requests (login page, public endpoints), use IP
// For authenticated requests with malformed tokens, also IP but log a warning
if (token) {
  console.warn('[RATE-LIMIT] Authenticated request with missing userId in token, falling back to IP');
}
return withRedisPrefix(`ratelimit:ip:${getClientIdentifier(request)}`);
```

**Key changes:**
1. Check for truthy values, not just type (empty string `''` is falsy — good, it won't pass)
2. Add `console.warn` when a token exists but has no userId (this signals a misconfiguration)
3. IP fallback is acceptable for unauthenticated routes (login, public) but should be rare for authenticated routes

**Why:** The production 429 incident was caused by inbox GET requests hitting the wrong rate-limit bucket. If the token is malformed, the identity extraction silently falls back to IP, causing all users on the same network to share one limit. This fix makes the identity extraction more robust and adds visibility when it degrades.

---

### FIX 4: Disable save button while new-client confirmation is showing

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx`

**Current (BYPASSABLE):**
The save button stays enabled while the confirmation dialog is open. User can click save multiple times, each triggering `handleSubmit()` independently, potentially creating duplicate clients.

**Fix — find the save/submit button and add the guard:**

```tsx
<button
  type="button"
  className={styles.saveButton}
  onClick={handleSubmit}
  disabled={isSubmitting || showNewClientConfirm}  // ← ADD showNewClientConfirm
>
```

**Also add a submitting guard at the top of `handleSubmit()`:**
```typescript
const handleSubmit = async () => {
  if (isSubmitting) return;  // ← ADD this guard if not already present
  setIsSubmitting(true);
  try {
    // ... existing submit logic ...
  } finally {
    setIsSubmitting(false);
  }
};
```

**Why:** Without this, clicking save rapidly while the confirmation dialog renders can trigger multiple appointment creations with duplicate client records.

---

### FIX 5: Add dashboard SWR error handling

**File:** `app/dashboard/DashboardPageClient.tsx`

**Current (SILENT FAILURE):**
```typescript
const { data, isLoading } = useSWR<DashboardData>(key, fetchDashboard, {
  revalidateOnFocus: false,
  dedupingInterval: 10000,
});
```

If the API fails, `data` stays `undefined`, the `EMPTY_DASHBOARD` fallback shows zeros, and the user has no idea anything is wrong.

**Fix:**
```typescript
const { data, error, isLoading, mutate } = useSWR<DashboardData>(key, fetchDashboard, {
  revalidateOnFocus: false,
  dedupingInterval: 10000,
});

// After the skeleton check, before rendering data, add error state:
if (error && !isLoading) {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h2>Eroare la încărcarea dashboard-ului</h2>
        <p>Nu am putut încărca datele. Verificați conexiunea și încercați din nou.</p>
        <button onClick={() => mutate()}>Reîncearcă</button>
      </main>
    </div>
  );
}
```

**Why:** Without error handling, a failed API call shows a dashboard full of zeros with no indication anything is wrong. The user thinks their clinic had zero activity.

---

## HIGH PRIORITY FIXES (Should fix soon)

### FIX 6: Add auth redirect to inbox for unauthenticated users

**File:** `app/inbox/InboxPageClient.tsx`

**Current:** If session is missing, inbox shows empty state "No conversations" instead of redirecting to login.

**Fix — add to the component, similar to dashboard:**
```typescript
const { data: session, status: sessionStatus } = useSession();
const router = useRouter();

useEffect(() => {
  if (sessionStatus === 'unauthenticated') {
    router.replace('/login');
  }
}, [sessionStatus, router]);
```

Also update the main data-fetching useEffect to wait for auth:
```typescript
useEffect(() => {
  if (sessionStatus !== 'authenticated') return;  // ← ADD this guard
  // ... existing fetchConversations logic ...
}, [sessionStatus, /* existing deps */]);
```

---

### FIX 7: Simplify `isWriteOperation()` / `getRateLimitBucket()`

**File:** `middleware.ts`

**Current architecture is fragile.** The `isWriteOperation()` function checks method first and path second, but the path check only applies to mutations. The explicit inbox guard in `getRateLimitBucket()` was added as a band-aid. New GET endpoints added in the future will work "by accident."

**Fix — simplify to explicit method-based classification:**

```typescript
function getRateLimitBucket(pathname: string, method: string): RateLimitBucket {
  // Sync bucket — highest priority, most restrictive
  if (pathname.startsWith('/api/yahoo/sync')) {
    return 'sync';
  }

  // Write bucket — all mutation methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
    return 'write';
  }

  // Everything else is read
  return 'read';
}
```

**Then remove:**
- The `isWriteOperation()` function entirely
- The `writePaths` array
- The explicit inbox GET guard (no longer needed — all GETs are 'read' by default)

**Why:** The current code works by accident for GET endpoints. This simplification makes the logic explicit: mutations are 'write', reads are 'read', sync is 'sync'. No path-based guessing needed.

---

### FIX 8: Remove dead `userId` fields from ALL validation schemas

**File:** `lib/validation.ts`

**Audit every schema** and remove `userId` fields that are validated but never extracted by the API route. The server always uses `getAuthUser()`. Having `userId` in schemas:
- Confuses developers about what the API expects
- Creates security risk (client can send arbitrary userId)
- Forces the client to send dummy values (see Fix 1)

**Schemas to check:**
- `createNoteSchema` — already fixed in Fix 1
- `createClientSchema` — remove `userId` if present
- `createServiceSchema` — remove `userId` if present
- `createAppointmentSchema` — remove `userId` if present
- Any other schema — search for `userId` in the file

**For each one:**
1. Check the corresponding API route to confirm `userId` from the body is never used
2. Remove the field from the schema
3. Remove `userId` from the client-side `body: JSON.stringify({...})` calls if present

---

### FIX 9: Add missing MongoDB indexes for search fields

**File:** `migrations/001_init_mongodb.js` (or create a new migration)

The search implementation (Section 30) does regex queries on fields without indexes. At current scale (10 cabinets) this is OK, but it will degrade with data growth.

**Add these indexes:**
```javascript
// conversations collection
db.conversations.createIndex(
  { tenant_id: 1, user_id: 1, contact_name: 1 },
  { name: 'conversations_tenant_user_contact_name' }
);

// appointments collection (if not already covered by existing indexes)
db.appointments.createIndex(
  { tenant_id: 1, user_id: 1, client_name: 1 },
  { name: 'appointments_tenant_user_client_name' }
);
```

Note: These won't help regex queries directly (MongoDB can't use B-tree indexes for regex unless the regex is prefix-anchored like `/^Ion/`). For full-text search at scale, consider MongoDB text indexes. But for now, the compound index helps narrow the scan to tenant+user first.

**Priority:** LOW — acceptable at current scale but should be done before onboarding more clinics.

---

## MEDIUM PRIORITY (Fix when convenient)

### FIX 10: Handle end-time validation edge case at day boundary

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx` (around line 344-357)

If start time is 23:45, `endTimeOptions` is empty, and the user can't set any end time. Add a guard:

```typescript
// In the endTimeOptions generation, ensure at least one option exists
// If start time is too late for minimum duration, show a message or cap the start time
if (endTimeOptions.length === 0) {
  // Option A: Show validation message
  toast.warning('Ora de început este prea târzie pentru durata minimă de 15 minute.');
  // Option B: Auto-set end to 00:00 next day (if overnight appointments are allowed)
}
```

### FIX 11: Add error feedback for failed client search in appointment modal

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx` (around line 383)

When the client search API fails, it silently returns empty results. Users think no clients exist and create duplicates.

```typescript
if (!response.ok) {
  console.error('Client search failed:', response.status);
  toast.error('Eroare la căutarea clienților existenți');
  return;
}
```

### FIX 12: Duration rounding — warn instead of silently correcting

**File:** `app/calendar/components/modals/CreateAppointmentModal.tsx` (around line 441)

If `endTime < startTime`, show a validation error instead of silently correcting to 15 minutes:

```typescript
if (selectedEndDateTime <= selectedStartDateTime) {
  toast.error('Ora de final trebuie să fie după ora de început');
  return;
}
```

---

## Validation Checklist

After all fixes, run:
```bash
npm run typecheck
npm run build
```

Both must pass with zero errors. Then manually test:
1. [ ] Create a note on client profile — verify userId in DB is NOT 1
2. [ ] Create two appointments for "Ion Popescu" with different emails — verify two separate client records
3. [ ] Open inbox while logged out — verify redirect to /login
4. [ ] Dashboard with API failure (e.g., stop the server mid-load) — verify error message, not empty zeros
5. [ ] Open appointment modal, type new client name, verify save button disabled during confirmation
6. [ ] Verify rate-limit bucket classification: GET requests → read, POST requests → write
