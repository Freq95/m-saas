# PHASE 4: Testing & Hardening

**Priority:** HIGH — Confidence that things don't break when you ship
**Estimated effort:** 4-5 days
**Dependencies:** Phase 3 (infrastructure) complete
**Commit message:** `PHASE-04: Add tests, audit logging, input sanitization, type safety`

---

## Context

Read `REVIEW-phase3-5.md` sections 1.5 (Zero Tests), 2.5 (any types), 3.1 (XSS), 5.2 (Soft Deletes).

Zero automated tests exist. 110 `any` usages. No audit logging. No input sanitization beyond Zod schema validation.

---

## Task 4.1: Set up test framework

### Install:
```bash
npm install -D vitest @vitejs/plugin-react mongodb-memory-server @testing-library/react @testing-library/jest-dom
```

### Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
});
```

### Create `tests/setup.ts`:
```typescript
import { MongoMemoryServer } from 'mongodb-memory-server';
import { beforeAll, afterAll } from 'vitest';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
});

afterAll(async () => {
  await mongoServer.stop();
});
```

### Create `tests/helpers.ts`:
```typescript
// Shared test utilities: create test user, create test tenant, seed data, etc.
```

### Update `package.json` scripts:
```json
"test": "vitest",
"test:run": "vitest run",
"test:coverage": "vitest run --coverage"
```

### Acceptance criteria:
- [ ] `vitest.config.ts` exists
- [ ] `tests/setup.ts` starts MongoMemoryServer
- [ ] `npm test` runs without errors (even with 0 tests)
- [ ] Build passes

---

## Task 4.2: Write unit tests (minimum 20 tests)

### Test files to create:

**`tests/unit/calendar-conflicts.test.ts`** (8+ tests):
- Overlapping appointment detected
- Non-overlapping appointment allowed
- Same provider conflict detected
- Different provider no conflict
- Resource conflict detected
- Blocked time conflict detected
- Working hours boundary respected
- Alternative slot suggestion works

**`tests/unit/client-matching.test.ts`** (5+ tests):
- Match by exact email
- Match by normalized phone (Romanian +40)
- No match for unknown contact
- Dedup logic creates new client when no match
- Case-insensitive email matching

**`tests/unit/validation.test.ts`** (7+ tests):
- Valid appointment schema passes
- Invalid email rejected
- Invalid date rejected
- Missing required fields rejected
- XSS in string fields stripped
- Phone format validated
- userId no longer has default value

### Acceptance criteria:
- [ ] 20+ unit tests exist
- [ ] All pass: `npm run test:run`
- [ ] Calendar conflict logic tested thoroughly
- [ ] Client matching logic tested
- [ ] Validation schemas tested

---

## Task 4.3: Write integration tests (minimum 15 tests)

### Test files to create:

**`tests/integration/auth.test.ts`** (5+ tests):
- Register new user → success
- Register duplicate email → 409
- Login with correct password → session
- Login with wrong password → 401
- Unauthenticated request to protected route → 401

**`tests/integration/tenant-isolation.test.ts`** (5+ tests):
- User A creates appointment → User A can see it
- User B cannot see User A's appointment
- User A creates client → User B cannot see it
- Cross-tenant file access blocked
- Team member in Tenant A cannot access Tenant B

**`tests/integration/appointments.test.ts`** (5+ tests):
- Create appointment → 201
- Create conflicting appointment → 409
- Update appointment → 200
- Delete appointment → 204
- List appointments by date range

### Acceptance criteria:
- [ ] 15+ integration tests exist
- [ ] All pass: `npm run test:run`
- [ ] Auth flow tested end-to-end
- [ ] Tenant isolation verified in tests
- [ ] CRUD operations tested

---

## Task 4.4: Add audit logging

### Create `lib/audit.ts`:
```typescript
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo';

interface AuditLogEntry {
  tenant_id: ObjectId;
  user_id: ObjectId;
  action: string;              // 'appointment.created', 'client.deleted', etc.
  resource_type: string;       // 'appointment', 'client', 'file'
  resource_id: string | number;
  changes?: Array<{
    field: string;
    old_value: unknown;
    new_value: unknown;
  }>;
  ip_address: string;
  user_agent: string;
  timestamp: Date;
}

export async function logAudit(
  tenantId: ObjectId,
  userId: ObjectId,
  action: string,
  resourceType: string,
  resourceId: string | number,
  request: Request,
  changes?: AuditLogEntry['changes']
) {
  const db = await getMongoDbOrThrow();
  await db.collection('audit_logs').insertOne({
    tenant_id: tenantId,
    user_id: userId,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    changes,
    ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    user_agent: request.headers.get('user-agent') || 'unknown',
    timestamp: new Date(),
  });
}
```

### Add audit logging to critical routes:
- All DELETE operations → `logAudit(..., 'resource.deleted', ...)`
- All PATCH operations → `logAudit(..., 'resource.updated', ..., changes)`
- User login → `logAudit(..., 'user.login', ...)`
- Team member changes → `logAudit(..., 'team.member_added', ...)`
- File uploads → `logAudit(..., 'file.uploaded', ...)`

### Create `app/api/audit/route.ts`:
- GET: List audit logs for current tenant (owner only — no admin role in MVP)
- Support filters: date range, action type, user, resource

### Add index:
```javascript
db.audit_logs.createIndex({ tenant_id: 1, timestamp: -1 });
db.audit_logs.createIndex({ tenant_id: 1, resource_type: 1, resource_id: 1 });
// TTL: auto-delete after 7 years
db.audit_logs.createIndex({ timestamp: 1 }, { expireAfterSeconds: 220752000 });
```

### Acceptance criteria:
- [ ] `lib/audit.ts` exists
- [ ] DELETE operations are audit-logged
- [ ] PATCH operations are audit-logged with field changes
- [ ] Login events are audit-logged
- [ ] Audit log API endpoint exists (owner/admin only)
- [ ] Build passes

---

## Task 4.5: Add soft deletes to appointments and conversations

### Pattern:
```typescript
// BEFORE (hard delete):
await db.collection('appointments').deleteOne({ id, tenant_id: tenantId });

// AFTER (soft delete):
await db.collection('appointments').updateOne(
  { id, tenant_id: tenantId },
  { $set: { deleted_at: new Date(), deleted_by: userId } }
);

// All queries exclude soft-deleted:
await db.collection('appointments').find({
  tenant_id: tenantId,
  deleted_at: { $exists: false },  // or $eq: null
}).toArray();
```

### Apply to:
- `app/api/appointments/[id]/route.ts` — DELETE handler
- `app/api/conversations/[id]/route.ts` — if DELETE exists
- `app/api/tasks/[id]/route.ts` — DELETE handler
- All GET queries for these collections → exclude `deleted_at`

### Acceptance criteria:
- [ ] DELETE endpoints set `deleted_at` instead of removing document
- [ ] GET endpoints exclude documents with `deleted_at`
- [ ] Deleted data is recoverable (admin can undelete)
- [ ] Build passes

---

## Task 4.6: Input sanitization on all user-content routes

### Use DOMPurify (already installed) on all routes that accept user text:

```typescript
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

function sanitize(input: string): string {
  return purify.sanitize(input, {
    ALLOWED_TAGS: ['b', 'i', 'u', 'p', 'br', 'ul', 'li', 'a'],
    ALLOWED_ATTR: ['href'],
  });
}
```

Note: `dompurify` requires `jsdom` for server-side usage. Install if needed:
```bash
npm install jsdom
npm install -D @types/jsdom
```

Alternatively, use `isomorphic-dompurify`:
```bash
npm install isomorphic-dompurify
```

### Apply to these fields:
- Appointment `notes`
- Client `notes`
- Conversation message `content`
- Client notes `content`
- Task `description`

### Acceptance criteria:
- [ ] All user-submitted text is sanitized before storage
- [ ] XSS payloads in notes/messages are stripped
- [ ] Legitimate formatting (bold, italic, links) is preserved
- [ ] Build passes

---

## Task 4.7: Fix `any` types in core files

### Priority files (eliminate ALL `any` in these):

1. **`lib/db/storage-data.ts`** — All 17 collections typed as `any[]`. Replace with proper types:
```typescript
import { Appointment, Client, Conversation, Message, Service, Task } from '@/lib/types';

export interface StorageData {
  users: User[];
  appointments: Appointment[];
  clients: Client[];
  conversations: Conversation[];
  messages: Message[];
  services: Service[];
  tasks: Task[];
  // ... etc with proper types
}
```

If this file is only used by the now-deleted `getMongoData()`, delete the entire file.

2. **`lib/types.ts`** — Review all interfaces. Replace any `any` with proper types.

3. **`lib/client-matching.ts`** — Has local `Client` interface that duplicates `lib/types.ts`. Remove duplication.

4. **`lib/server/*.ts`** — Type all function parameters and return values.

5. **API route handlers** — Type request bodies and response objects.

### Acceptance criteria:
- [ ] `lib/db/storage-data.ts` deleted or properly typed
- [ ] Zero `any` in `lib/types.ts`
- [ ] Zero `any` in `lib/client-matching.ts`
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] Total `any` count reduced by at least 80%

---

## Task 4.8: Add CSRF protection to mutation routes

### Since NextAuth v5 handles CSRF for auth routes, add protection to other POST/PATCH/DELETE routes:

Option A: Use `next-auth`'s built-in CSRF (already handled by session cookies with `SameSite: Lax`).

Option B: Add explicit CSRF token validation:
```typescript
// In mutation routes:
const csrfToken = request.headers.get('x-csrf-token');
if (!csrfToken) {
  return createErrorResponse('CSRF token required', 403);
}
// Validate token against session
```

For SPA with API routes, `SameSite: Lax` cookies + checking `Origin` header is usually sufficient:
```typescript
// middleware.ts — add origin check for mutations
if (['POST', 'PATCH', 'DELETE'].includes(request.method)) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (origin && !origin.includes(host!)) {
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }
}
```

### Acceptance criteria:
- [ ] Mutation requests from different origins are blocked
- [ ] Same-origin requests work normally
- [ ] Webhook endpoints are excluded from CSRF check
- [ ] Build passes

---

## Final Verification

```bash
npm run build && npx tsc --noEmit
npm run test:run

# Test count:
npm run test:run 2>&1 | grep "Tests"
# Should show 35+ tests passed

# any count:
grep -r ": any" --include="*.ts" lib/ app/ | wc -l
# Should be significantly reduced from ~110
```

Commit:
```bash
git add -A && git commit -m "PHASE-04: Add tests, audit logging, input sanitization, type safety"
```
