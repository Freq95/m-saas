# PHASE 2: Multi-Tenancy

**Priority:** CRITICAL — Without this, Clinic A sees Clinic B's data
**Estimated effort:** 3-4 days
**Dependencies:** Phase 1 (auth) complete
**Commit message:** `PHASE-02: Add row-level multi-tenancy with tenant isolation`

---

## Context

Read `REVIEW-phase3-5.md` sections 1.2 (Tenant Isolation) and 4.2 (Multi-Tenant Strategy).

**Strategy: Row-level isolation** — every collection gets a `tenant_id` field. Every query filters by `tenant_id`.

**Note:** Tenant and team_member creation is already handled in Phase 1 (super-admin dashboard creates tenants, invite flow creates users). This phase focuses on **data isolation** — making sure every query is scoped to the authenticated user's tenant.

---

## Task 2.1: Verify tenant model from Phase 1

Phase 1 should have already created:
- `tenants` collection with indexes
- `team_members` collection with indexes
- `invite_tokens` collection with TTL index
- `lib/types/tenant.ts` with interfaces
- `getAuthUser()` returning `{ userId, tenantId, role }`

### Verification:
```bash
grep -r "tenant_id" lib/auth-helpers.ts
# Should show tenantId in return type

grep -r "tenants\|team_members\|invite_tokens" migrations/
# Should show collection creation
```

If any of these are missing, create them now before proceeding.

### Acceptance criteria:
- [ ] `getAuthUser()` returns `tenantId` as ObjectId
- [ ] `tenants`, `team_members`, `invite_tokens` collections exist in migration
- [ ] Build passes

---

## Task 2.2: Add `tenant_id` to ALL existing collections (migration)

### Create `scripts/migrate-add-tenant-id.ts`:

This script adds `tenant_id` to all existing documents. It finds (or creates) a default tenant for the existing data.

```typescript
import { getMongoDbOrThrow } from '../lib/db/mongo';
import { ObjectId } from 'mongodb';

async function migrateTenantId() {
  const db = await getMongoDbOrThrow();

  // Step 1: Find or create a default tenant for existing data
  let defaultTenant = await db.collection('tenants').findOne({});

  if (!defaultTenant) {
    console.log('No tenant found. Creating default tenant...');
    const result = await db.collection('tenants').insertOne({
      name: 'Default Clinic',
      slug: 'default-clinic',
      owner_id: null,  // Will be linked to first user later
      plan: 'free',
      status: 'active',
      settings: {
        timezone: 'Europe/Bucharest',
        currency: 'RON',
        working_hours: {
          monday: { start: '09:00', end: '18:00' },
          tuesday: { start: '09:00', end: '18:00' },
          wednesday: { start: '09:00', end: '18:00' },
          thursday: { start: '09:00', end: '18:00' },
          friday: { start: '09:00', end: '18:00' },
          saturday: null,
          sunday: null,
        },
      },
      created_at: new Date(),
      updated_at: new Date(),
    });
    defaultTenant = { _id: result.insertedId };
  }

  const tenantId = defaultTenant._id;
  console.log(`Using tenant_id: ${tenantId}`);

  // Step 2: Add tenant_id to all collections
  const collections = [
    'appointments',
    'clients',
    'conversations',
    'messages',
    'services',
    'tasks',
    'reminders',
    'blocked_times',
    'waitlist',
    'email_integrations',
    'client_files',
    'client_notes',
    'contact_files',
    'contact_notes',
    'providers',
    'resources',
  ];

  for (const collName of collections) {
    const result = await db.collection(collName).updateMany(
      { tenant_id: { $exists: false } },
      { $set: { tenant_id: tenantId } }
    );
    console.log(`${collName}: updated ${result.modifiedCount} documents`);
  }

  // Step 3: Link existing users to default tenant
  const usersUpdated = await db.collection('users').updateMany(
    { tenant_id: { $exists: false }, role: { $ne: 'super_admin' } },
    { $set: { tenant_id: tenantId } }
  );
  console.log(`users: updated ${usersUpdated.modifiedCount} documents`);

  console.log('Migration complete.');
  process.exit(0);
}

migrateTenantId().catch(console.error);
```

### Add to `package.json` scripts:
```json
"db:migrate:tenant": "tsx scripts/migrate-add-tenant-id.ts"
```

### Acceptance criteria:
- [ ] Migration script exists and runs without errors
- [ ] All existing documents in all collections have `tenant_id`
- [ ] Script is idempotent (safe to run multiple times — skips docs that already have tenant_id)
- [ ] Super-admin users are NOT given a tenant_id
- [ ] Build passes

---

## Task 2.3: Update ALL API routes to filter by `tenant_id`

This is the most critical task. **Every single database query in every API route must include `tenant_id`.**

### Pattern for GET (read) routes:
```typescript
import { getAuthUser } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  const { tenantId } = await getAuthUser();
  const db = await getMongoDbOrThrow();

  const appointments = await db.collection('appointments')
    .find({ tenant_id: tenantId })  // ← ALWAYS filter by tenant
    .sort({ start_time: -1 })
    .toArray();

  return createSuccessResponse({ appointments });
}
```

### Pattern for POST (create) routes:
```typescript
export async function POST(request: NextRequest) {
  const { userId, tenantId } = await getAuthUser();
  const db = await getMongoDbOrThrow();
  const body = await request.json();

  await db.collection('appointments').insertOne({
    ...validatedData,
    tenant_id: tenantId,           // ← ALWAYS set tenant on insert
    created_by: userId,            // ← Track who created it
    created_at: new Date(),
  });
}
```

### Pattern for PATCH/DELETE routes:
```typescript
export async function PATCH(request: NextRequest, { params }) {
  const { tenantId } = await getAuthUser();
  const db = await getMongoDbOrThrow();

  const result = await db.collection('appointments').updateOne(
    { id: parseInt(params.id), tenant_id: tenantId },  // ← Tenant in filter
    { $set: { ...updates, updated_at: new Date() } }
  );

  if (result.matchedCount === 0) {
    return createErrorResponse('Not found', 404);
  }
}
```

### Complete list of routes to update:

**Appointments:**
- `app/api/appointments/route.ts` — GET (list) + POST (create)
- `app/api/appointments/[id]/route.ts` — GET + PATCH + DELETE
- `app/api/appointments/recurring/route.ts` — POST

**Calendar:**
- `app/api/blocked-times/route.ts` — GET + POST
- `app/api/calendar/slots/route.ts` — GET
- `app/api/calendar/conflicts/route.ts` — GET or POST

**Clients:**
- `app/api/clients/route.ts` — GET + POST
- `app/api/clients/[id]/route.ts` — GET + PATCH + DELETE
- `app/api/clients/[id]/files/route.ts` — GET + POST
- `app/api/clients/[id]/files/[fileId]/route.ts` — DELETE
- `app/api/clients/[id]/files/[fileId]/download/route.ts` — GET
- `app/api/clients/[id]/files/[fileId]/preview/route.ts` — GET
- `app/api/clients/[id]/notes/route.ts` — GET + POST
- `app/api/clients/[id]/stats/route.ts` — GET
- `app/api/clients/export/route.ts` — GET

**Conversations:**
- `app/api/conversations/route.ts` — GET + POST
- `app/api/conversations/[id]/route.ts` — GET + PATCH
- `app/api/conversations/[id]/messages/route.ts` — GET + POST
- `app/api/conversations/[id]/read/route.ts` — PATCH
- `app/api/conversations/[id]/attachments/*/route.ts` — POST
- `app/api/conversations/[id]/images/*/route.ts` — POST

**Services:**
- `app/api/services/route.ts` — GET + POST
- `app/api/services/[id]/route.ts` — GET + PATCH + DELETE

**Tasks:**
- `app/api/tasks/route.ts` — GET + POST
- `app/api/tasks/[id]/route.ts` — GET + PATCH + DELETE

**Reminders:**
- `app/api/reminders/route.ts` — GET + POST
- `app/api/reminders/[id]/route.ts` — GET + PATCH + DELETE
- `app/api/reminders/process/route.ts` — POST

**Providers & Resources:**
- `app/api/providers/route.ts` — GET + POST
- `app/api/resources/route.ts` — GET + POST

**Settings:**
- `app/api/settings/email-integrations/route.ts` — GET + POST
- `app/api/settings/email-integrations/[id]/route.ts` — GET + PATCH + DELETE
- `app/api/settings/email-integrations/yahoo/route.ts` — POST

**Waitlist:**
- `app/api/waitlist/route.ts` — GET + POST + DELETE

**Dashboard:**
- `lib/server/dashboard.ts` — All queries must filter by tenant

### For related resources, verify parent ownership:
```typescript
// Example: uploading a file to a client
// First verify the client belongs to this tenant
const client = await db.collection('clients').findOne({
  id: clientId,
  tenant_id: tenantId,
});
if (!client) {
  return createErrorResponse('Client not found', 404);
}
// Then proceed with file upload
```

### RULES:
1. Every `find()` / `findOne()` → must have `tenant_id` in filter
2. Every `insertOne()` → must include `tenant_id` in document
3. Every `updateOne()` / `deleteOne()` → must have `tenant_id` in filter
4. Nested resources → verify parent belongs to tenant first
5. The old `user_id` field stays as `created_by` for audit purposes

### Acceptance criteria:
- [ ] Every GET route filters by `tenant_id`
- [ ] Every POST route includes `tenant_id` in the inserted document
- [ ] Every PATCH/DELETE route includes `tenant_id` in the filter
- [ ] Nested resources verify parent ownership
- [ ] Build passes

---

## Task 2.4: Add compound indexes for tenant queries

### Create `scripts/create-tenant-indexes.ts`:
```typescript
import { getMongoDbOrThrow } from '../lib/db/mongo';

async function createIndexes() {
  const db = await getMongoDbOrThrow();

  // Appointments
  await db.collection('appointments').createIndex({ tenant_id: 1, start_time: -1 });
  await db.collection('appointments').createIndex({ tenant_id: 1, client_id: 1 });
  await db.collection('appointments').createIndex({ tenant_id: 1, provider_id: 1, start_time: 1 });
  await db.collection('appointments').createIndex({ tenant_id: 1, status: 1 });

  // Clients
  await db.collection('clients').createIndex({ tenant_id: 1, status: 1 });
  await db.collection('clients').createIndex({ tenant_id: 1, email: 1 });
  await db.collection('clients').createIndex({ tenant_id: 1, name: 1 });
  await db.collection('clients').createIndex({ tenant_id: 1, created_at: -1 });

  // Conversations
  await db.collection('conversations').createIndex({ tenant_id: 1, updated_at: -1 });
  await db.collection('conversations').createIndex({ tenant_id: 1, channel: 1 });

  // Messages
  await db.collection('messages').createIndex({ conversation_id: 1, created_at: -1 });

  // Services
  await db.collection('services').createIndex({ tenant_id: 1, is_active: 1 });

  // Tasks
  await db.collection('tasks').createIndex({ tenant_id: 1, status: 1, due_date: 1 });

  // Reminders
  await db.collection('reminders').createIndex({ tenant_id: 1, status: 1, scheduled_at: 1 });

  // Email integrations (unique per tenant + provider)
  await db.collection('email_integrations').createIndex(
    { tenant_id: 1, provider: 1 },
    { unique: true }
  );

  // Client files
  await db.collection('client_files').createIndex({ tenant_id: 1, client_id: 1 });

  // Providers
  await db.collection('providers').createIndex({ tenant_id: 1, is_active: 1 });

  // Resources
  await db.collection('resources').createIndex({ tenant_id: 1, type: 1, is_active: 1 });

  // Blocked times
  await db.collection('blocked_times').createIndex({ tenant_id: 1, start_time: 1 });

  console.log('All indexes created.');
  process.exit(0);
}

createIndexes().catch(console.error);
```

### Add to `package.json`:
```json
"db:indexes": "tsx scripts/create-tenant-indexes.ts"
```

### Acceptance criteria:
- [ ] Script creates all indexes without errors
- [ ] All hot query paths have compound indexes starting with `tenant_id`
- [ ] Unique constraint on `email_integrations` per tenant
- [ ] Build passes

---

## Task 2.5: Staff invite flow (tenant-scoped)

The super-admin creates tenants and clinic owners (Phase 1). Now clinic owners need to invite their own staff.

### Create `app/api/team/invite/route.ts`:
```typescript
export async function POST(request: NextRequest) {
  const { userId, tenantId, role } = await getAuthUser();

  // Only owner and admin can invite
  requireRole(role, 'admin');

  const { email, name, memberRole } = await request.json();

  // Validate: can't invite with higher role than yourself
  // owner can invite anyone; admin can invite staff/viewer only
  if (role === 'admin' && ['owner', 'admin'].includes(memberRole)) {
    return createErrorResponse('Cannot invite users with equal or higher role', 403);
  }

  const db = await getMongoDbOrThrow();

  // ── Seat limit check ──────────────────────────────────────────
  // Count active + pending (non-removed) members for this tenant
  const activeMembers = await db.collection('team_members').countDocuments({
    tenant_id: tenantId,
    status: { $ne: 'removed' },
  });
  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  if (!tenant) {
    return createErrorResponse('Tenant not found', 404);
  }
  if (activeMembers >= tenant.max_seats) {
    return createErrorResponse(
      `Seat limit reached (${activeMembers}/${tenant.max_seats}). ` +
      `Remove a member or ask the platform admin to increase your seat limit.`,
      403
    );
  }
  // ──────────────────────────────────────────────────────────────

  // Check if user already exists in this tenant
  const existingMember = await db.collection('team_members').findOne({
    tenant_id: tenantId,
    email: email.toLowerCase(),
    status: { $ne: 'removed' },
  });
  if (existingMember) {
    return createErrorResponse('User is already a member of this tenant', 409);
  }

  // Create user record (pending)
  const userResult = await db.collection('users').insertOne({
    email: email.toLowerCase(),
    password_hash: null,
    name,
    role: memberRole,
    tenant_id: tenantId,
    status: 'pending_invite',
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Create team membership
  await db.collection('team_members').insertOne({
    tenant_id: tenantId,
    user_id: userResult.insertedId,
    role: memberRole,
    invited_by: userId,
    invited_at: new Date(),
    accepted_at: null,
    status: 'pending',
  });

  // Create invite token and send email
  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  const token = await createInviteToken(email, userResult.insertedId, tenantId, memberRole, userId);
  await sendInviteEmail(email, name, tenant?.name || 'Unknown', token);

  return createSuccessResponse({ message: 'Invite sent' }, { status: 201 });
}
```

### Create `app/api/team/route.ts`:
- GET: List team members for current tenant (admin+ only)

### Create `app/api/team/[memberId]/route.ts`:
- PATCH: Update member role (admin+ only, can't change owner)
- DELETE: Remove member (admin+ only, can't remove owner, soft-delete: status → 'removed')

### Acceptance criteria:
- [ ] Clinic owner can invite staff via email
- [ ] Admin can invite staff/viewer but not owner/admin
- [ ] **Invite blocked when active+pending members >= `max_seats`** (returns 403 with clear message)
- [ ] **Seat count includes both active and pending (non-removed) members**
- [ ] **Removing a member frees up a seat (allows new invite)**
- [ ] Invite email is sent with set-password link
- [ ] Team member list shows all members with roles and statuses
- [ ] **Team member list shows seat usage (e.g. "3 / 5 seats")**
- [ ] Role changes work with hierarchy enforcement
- [ ] Owner cannot be removed
- [ ] Build passes

---

## Final Verification

```bash
npm run build && npx tsc --noEmit

# Run tenant migration:
npm run db:migrate:tenant

# Run index creation:
npm run db:indexes

# Verify tenant_id is everywhere:
grep -r "tenant_id" --include="*.ts" app/api/ | wc -l
# Should be 60+ (every route file, multiple occurrences)

# Verify no unprotected queries (spot-check):
# Open 5 random route files and confirm every find/findOne/updateOne/deleteOne has tenant_id
```

### Critical manual test (if dev server available):
1. Create two tenants via super-admin dashboard
2. Log in as Tenant A owner → create a client
3. Log in as Tenant B owner → verify client is NOT visible
4. Try to access Tenant A's client via direct API call as Tenant B → should get 404

Commit:
```bash
git add -A && git commit -m "PHASE-02: Add row-level multi-tenancy with tenant isolation"
```
