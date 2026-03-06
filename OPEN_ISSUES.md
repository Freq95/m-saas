# Open Issues — m-saas Code Review

Generated: 2026-03-06
Source: Layer 2 Code Review (6-area audit)

Items listed here were identified during the review but **not yet fixed**. They are ranked by severity and include the exact file/line, the problem, and a concrete fix.

---

## CRITICAL

### C-1 · `/api/clients/export` — OOM crash on large tenants
**File:** `app/api/clients/export/route.ts:12`

**Problem:** `.toArray()` loads every client record into server memory in one shot. A tenant with 10 000+ clients will trigger an out-of-memory crash with no graceful degradation.

**Fix options (pick one):**

Option A — Hard cap (fastest):
```typescript
const MAX_EXPORT = 10_000;
const clients = await db
  .collection('clients')
  .find({ user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } })
  .sort({ name: 1 })
  .limit(MAX_EXPORT)
  .toArray();
```
Return a `X-Export-Truncated: true` header when the collection exceeds the cap.

Option B — Streaming cursor (correct):
Use MongoDB cursor + a `Transform` stream to build the CSV incrementally and pipe it into a `ReadableStream` passed to `new NextResponse(stream)`.

---

## HIGH

### H-1 · Rate limiting missing on PATCH / DELETE routes (appointments, clients, services, tasks, conversations, team, blocked-times)
**Files:** `app/api/appointments/[id]/route.ts`, `app/api/clients/[id]/route.ts`, `app/api/services/[id]/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/conversations/[id]/route.ts`, `app/api/team/[memberId]/route.ts`, `app/api/blocked-times/[id]/route.ts` (if it exists)

**Problem:** The write rate limit was applied to all collection-level POST routes but the individual resource PATCH/DELETE routes (`[id]` routes) were not touched. An authenticated user can still spam edits/deletes at unbounded rate.

**Fix:** Import `checkWriteRateLimit` from `@/lib/rate-limit` and add the guard immediately after `getAuthUser()` in every PATCH and DELETE handler in the above files. Same two-line pattern used in the POST routes:
```typescript
const limited = await checkWriteRateLimit(userId);
if (limited) return limited;
```

---

### H-2 · Timing attack on forgot-password — user enumeration via response time
**File:** `app/api/auth/forgot-password/route.ts:84`

**Problem:** When the supplied email belongs to a registered user, the handler executes `crypto.randomBytes`, a DB insert, and an email send (~200–500 ms). When the email is unknown, it returns immediately (~5 ms). An attacker measuring response times can enumerate valid accounts.

**Fix:** Add a fixed minimum response delay regardless of outcome:
```typescript
const MIN_RESPONSE_MS = 500;
const start = Date.now();

// ... existing logic ...

// Ensure constant response time before returning
const elapsed = Date.now() - start;
if (elapsed < MIN_RESPONSE_MS) {
  await new Promise((resolve) => setTimeout(resolve, MIN_RESPONSE_MS - elapsed));
}
return NextResponse.json({ success: true });
```
Apply this pattern to both the "user found" and "user not found" branches so they take the same wall-clock time.

---

### H-3 · Inbox admin routes missing Zod schemas
**Files:** `app/api/admin/tenants/route.ts:103`, `app/api/admin/users/[id]/route.ts`

**Problem:** The admin tenant creation POST and admin user PATCH/DELETE routes use inline string coercion (`typeof body?.clinicName === 'string' ? body.clinicName.trim() : ''`) instead of Zod validation. Values like `maxSeats` are manually coerced with `parseInt(...) || 1`, which silently accepts negative strings.

**Fix:** Add schemas to `lib/validation.ts`:
```typescript
export const createTenantSchema = z.object({
  clinicName: z.string().min(1).max(255),
  ownerEmail: emailSchema,
  ownerName: z.string().min(1).max(255),
  plan: z.enum(['free', 'starter', 'pro']).default('free'),
  maxSeats: z.number().int().positive().default(1),
  sendInvite: z.boolean().default(true),
});
```
Then call `createTenantSchema.safeParse(body)` at the start of the POST handler and return 400 on failure.

---

### H-4 · Rate limiting missing on conversations `[id]` sub-routes (messages, read)
**Files:** `app/api/conversations/[id]/messages/route.ts`, `app/api/conversations/[id]/read/route.ts` (if present)

**Problem:** Creating messages in a conversation is a write operation not covered by the rate limit applied to `app/api/conversations/route.ts`. A user can flood a conversation with messages at unbounded rate.

**Fix:** Apply `checkWriteRateLimit` to the messages POST handler, same pattern as other write routes.

---

## MEDIUM

### M-1 · ESC key handler delegates to child modal without explicit guard
**File:** `app/calendar/CalendarPageClient.tsx:325`

**Problem:** The parent ESC handler has a comment "Let CreateAppointmentModal handle its own ESC" with no parent-level guard. This creates implicit coupling: if the child modal's ESC handler is ever removed or changed, the parent will silently swallow ESC without closing anything.

**Fix:** After closing sub-modals (delete confirm, conflict modal), explicitly check whether the create modal is open and close it:
```typescript
if (showCreateModal) {
  // isDirty guard lives inside CreateAppointmentModal; call its close handler
  handleCloseCreateModal();
  return;
}
```
Expose a `requestClose` prop on `CreateAppointmentModal` that the parent calls, and let the modal decide whether to show the dirty-state confirm.

---

### M-2 · Attachment filter is client-side only — scales poorly
**File:** `app/inbox/InboxPageClient.tsx:445`

**Problem:** The `attachmentsOnly` filter operates on `allConversations` which is already loaded in memory. For tenants with thousands of conversations, the initial page load fetches all of them. There is no server-side `has_attachments` filter param.

**Fix (short-term):** Add `?hasAttachments=true` query param support to `GET /api/conversations` and filter at the MongoDB layer when the param is set. This prevents over-fetching.

---

### M-3 · Webhook endpoint returns 401 (not 503) when `WEBHOOK_SECRET` is absent
**File:** `app/api/webhooks/email/route.ts:10`

**Problem:** When `WEBHOOK_SECRET` is not set, `verifyWebhookSignature` returns `false`, and the route returns 401. This looks like an auth failure to external callers when it is actually a misconfiguration. Monitoring systems may not alert on this.

**Fix:** Check for the secret at startup (or at the top of the handler) and return 503 with a descriptive body when it is absent:
```typescript
if (!process.env.WEBHOOK_SECRET) {
  return NextResponse.json(
    { error: 'Webhook endpoint not configured' },
    { status: 503 }
  );
}
```
Alternatively, add `WEBHOOK_SECRET` to `lib/env-validation.ts` as a required variable so the app fails fast at boot.

---

### M-4 · `clients/export` inconsistent error response shape
**File:** `app/api/clients/export/route.ts`

**Problem:** If this route uses `NextResponse.json()` directly for errors instead of `createErrorResponse()` / `handleApiError()`, it breaks the standardised error shape expected by the API client.

**Fix:** Replace any `NextResponse.json({ error: ... }, { status: ... })` calls with `createErrorResponse(message, status)` from `@/lib/error-handler`. Verify after fixing C-1 above.

---

### M-5 · `waitlist` route still uses raw `NextResponse.json()` for responses
**File:** `app/api/waitlist/route.ts`

**Problem:** All three handlers (GET, POST, DELETE) return `NextResponse.json()` directly instead of `createSuccessResponse()` / `createErrorResponse()`, breaking the standardised response envelope.

**Fix:** Replace:
```typescript
return NextResponse.json({ waitlist });                    // GET
return NextResponse.json({ entry }, { status: 201 });     // POST
return NextResponse.json({ success: true });              // DELETE
return NextResponse.json({ error: '...' }, { status: N }); // errors
```
With:
```typescript
import { createSuccessResponse, createErrorResponse, handleApiError } from '@/lib/error-handler';
// GET
return createSuccessResponse({ waitlist });
// POST
return createSuccessResponse({ entry }, 201);
// DELETE
return createSuccessResponse({ success: true });
// errors
return createErrorResponse(message, status);
// catch
return handleApiError(error, 'Failed to ...');
```

---

## LOW

### L-1 · `getClientSegments` appointment query counted deleted records
**Status: FIXED** — `deleted_at: { $exists: false }` added at `lib/client-matching.ts:386`.

*(Kept here for reference; already closed.)*

---

## Notes for Next Session

- **Rate limiting on `[id]` routes (H-1)** is the highest-priority remaining item.
- The **OOM export fix (C-1)** should be done before any marketing or public launch — a single large tenant can crash the server.
- **Timing attack (H-2)** is low effort (~10 lines) and should be included in the next PR.
- Items M-4 and M-5 (error response consistency) can be batched together since they are in the same area of code.
