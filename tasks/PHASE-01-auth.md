# PHASE 1: Authentication (Invite-Only + Super-Admin Dashboard)

**Priority:** CRITICAL — Nothing works without this
**Estimated effort:** 4-5 days
**Dependencies:** Phase 0 complete
**Commit message:** `PHASE-01: Add NextAuth v5 auth, invite-only onboarding, super-admin dashboard`

---

## Context

Read `REVIEW-phase3-5.md` section 1.1 (Zero Authentication) and `REVIEW-phase1.md` section 3.2.

Currently `DEFAULT_USER_ID = 1` is hardcoded everywhere. No login, no sessions, no auth.

**Architecture decision:** This is NOT a self-serve product. There is no public registration. The platform owner (super-admin) creates tenants and invites clinic owners. Clinic owners can then invite their own staff. This is the standard B2B SaaS invite-only pattern.

### Auth flows:
1. **Super-admin** creates a tenant + clinic owner via admin dashboard
2. **System** sends invite email to clinic owner ("Set your password")
3. **Clinic owner** clicks link → sets password → can log in
4. **Clinic owner** invites staff from within their tenant (same invite flow)
5. **Login** is email + password only. No OAuth, no magic links.

### MVP Role Model (Simplified):
| Role | Scope | Description |
|------|-------|-------------|
| `super_admin` | Platform-wide | Platform owner. Creates tenants, manages everything. No tenant_id. |
| `owner` | Tenant-scoped | Clinic owner. Has ALL permissions within their tenant: manage team (invite/remove staff), manage clinic settings, manage own calendar/appointments, own client/patient list & CRM. Only role that can invite new team members. |
| `staff` | Tenant-scoped | Clinic staff (dentist, hygienist, etc.). Can view own calendar, manage own appointments, own client/patient list & CRM. Cannot see other staff calendars. Cannot access clinic settings. Cannot invite team members. |
| `viewer` | — | Defined but NOT implemented for MVP. Reserved for future use. |

**Removed for MVP:** `admin` role (merged into `owner`). Owner now has all admin attributes.
**Not implemented for MVP:** `viewer` role. No UI or permission checks needed.
**Calendar visibility:** Staff sees only their own calendar. Owner sees only their own calendar (shared tenant calendar deferred to post-MVP).
**`is_provider` flag:** Documented for future use (distinguishes bookable dentists from non-bookable receptionists). Not implemented for MVP.
**Staff invite:** Owner-only. Staff cannot invite other team members.

---

## Setup

### Install dependencies:
```bash
npm install next-auth@beta @auth/mongodb-adapter resend
```

Note: `bcryptjs` is already installed. `next-auth@beta` is Auth.js v5 for Next.js App Router. `resend` is for sending invite emails.

---

## Task 1.1: Configure NextAuth v5 (Credentials only)

### Create `lib/auth.ts`:
```typescript
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { getMongoDbOrThrow } from '@/lib/db/mongo';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
    error: '/login?error=true',
  },
  providers: [
    Credentials({
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const db = await getMongoDbOrThrow();
        const user = await db.collection('users').findOne({
          email: (credentials.email as string).toLowerCase().trim(),
        });

        if (!user || !user.password_hash) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash
        );
        if (!isValid) return null;

        return {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role,            // 'super_admin' | 'owner' | 'staff'
          tenantId: user.tenant_id?.toString() || null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as string;
        session.user.tenantId = token.tenantId as string | null;
      }
      return session;
    },
  },
});
```

**Create `app/api/auth/[...nextauth]/route.ts`:**
```typescript
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
```

### Extend NextAuth types:

**Create `types/next-auth.d.ts`:**
```typescript
import 'next-auth';

declare module 'next-auth' {
  interface User {
    role: string;
    tenantId: string | null;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: string;
      tenantId: string | null;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string;
    role: string;
    tenantId: string | null;
  }
}
```

### Update `.env.example`:
```
# Auth (required)
AUTH_SECRET=  # Generate: openssl rand -base64 32

# Email (required for invite flow)
RESEND_API_KEY=
EMAIL_FROM=noreply@yourdomain.com
```

### Acceptance criteria:
- [x] `lib/auth.ts` exists with Credentials provider only (no Google OAuth)
- [x] `app/api/auth/[...nextauth]/route.ts` exists
- [x] JWT session strategy with `userId`, `role`, `tenantId`
- [x] NextAuth types extended for role and tenantId
- [x] Build passes

---

## Task 1.2: Create auth helpers

### Create `lib/auth-helpers.ts`:
```typescript
import { auth } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export class AuthError extends Error {
  public status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

// MVP roles: super_admin, owner, staff
// 'admin' removed (merged into owner). 'viewer' reserved but not implemented.
export type UserRole = 'super_admin' | 'owner' | 'staff';

interface AuthContext {
  userId: ObjectId;
  tenantId: ObjectId;
  email: string;
  name: string;
  role: UserRole;
}

// Use in every tenant-scoped API route
export async function getAuthUser(): Promise<AuthContext> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError('Not authenticated', 401);
  }
  if (!session.user.tenantId) {
    throw new AuthError('No tenant associated with this account', 403);
  }
  return {
    userId: new ObjectId(session.user.id),
    tenantId: new ObjectId(session.user.tenantId),
    email: session.user.email!,
    name: session.user.name || '',
    role: session.user.role as UserRole,
  };
}

// Use in super-admin routes only
export async function getSuperAdmin(): Promise<{ userId: ObjectId; email: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError('Not authenticated', 401);
  }
  if (session.user.role !== 'super_admin') {
    throw new AuthError('Super-admin access required', 403);
  }
  return {
    userId: new ObjectId(session.user.id),
    email: session.user.email!,
  };
}

// MVP role hierarchy (admin removed, viewer not implemented)
const ROLE_HIERARCHY: UserRole[] = ['staff', 'owner', 'super_admin'];

export function requireRole(userRole: UserRole, minimumRole: UserRole) {
  if (ROLE_HIERARCHY.indexOf(userRole) < ROLE_HIERARCHY.indexOf(minimumRole)) {
    throw new AuthError(`Requires at least ${minimumRole} role`, 403);
  }
}
```

### Acceptance criteria:
- [x] `getAuthUser()` returns `{ userId, tenantId, email, name, role }` — for tenant routes
- [x] `getSuperAdmin()` returns super-admin context — for admin routes
- [x] `requireRole()` checks role hierarchy
- [x] AuthError includes HTTP status code (401 vs 403)
- [x] Build passes

---

## Task 1.3: Create the super-admin user (seed script)

### Create `scripts/create-super-admin.ts`:

This script creates the platform's first user — YOU. Run it once.

```typescript
import { getMongoDbOrThrow } from '../lib/db/mongo';
import bcrypt from 'bcryptjs';

async function createSuperAdmin() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || 'Platform Admin';

  if (!email || !password) {
    console.error('Usage: tsx scripts/create-super-admin.ts <email> <password> [name]');
    process.exit(1);
  }

  const db = await getMongoDbOrThrow();

  // Check if already exists
  const existing = await db.collection('users').findOne({ email: email.toLowerCase() });
  if (existing) {
    console.error(`User ${email} already exists`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.collection('users').insertOne({
    email: email.toLowerCase().trim(),
    password_hash: passwordHash,
    name,
    role: 'super_admin',
    tenant_id: null,          // Super-admin has no tenant — they manage ALL tenants
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
  });

  console.log(`Super-admin created: ${email}`);
  process.exit(0);
}

createSuperAdmin().catch(console.error);
```

### Add to `package.json` scripts:
```json
"admin:create": "tsx scripts/create-super-admin.ts"
```

### Usage:
```bash
npm run admin:create -- your@email.com YourSecurePassword123 "Your Name"
```

### Acceptance criteria:
- [x] Script creates a user with `role: 'super_admin'` and `tenant_id: null`
- [x] Password hashed with bcrypt (cost 12)
- [x] Prevents duplicate creation
- [x] Build passes

---

## Task 1.4: Create the super-admin dashboard

This is YOUR control panel. It lives at `/admin/*` and is only accessible to `super_admin` role.

### Create `app/(admin)/admin/layout.tsx`:
- Check session — redirect to `/login` if not authenticated
- Check role — show 403 page if not `super_admin`
- Simple sidebar layout: Dashboard | Tenants | Users
- Different styling from the main app (make it clear you're in admin mode)

### Create `app/(admin)/admin/page.tsx` (Dashboard):
- Total tenants count
- Total users count
- Tenants by plan breakdown (free/starter/pro)
- Recently created tenants (last 10)
- Quick action buttons: "Create Tenant", "View All Tenants"

### Create `app/(admin)/admin/tenants/page.tsx` (Tenant list):
- Table: Name | Plan | Owner Email | Users Count | Status | Created | Actions
- Search by name or owner email
- Filter by plan (free/starter/pro) and status (active/suspended)
- "Create Tenant" button → opens create form

### Create `app/(admin)/admin/tenants/new/page.tsx` (Create tenant form):
**This is the main onboarding flow.** Fields:
- **Clinic name** (required) — e.g. "Cabinet Stomatologic Dr. Popescu"
- **Owner email** (required) — the clinic owner who will manage it
- **Owner name** (required) — display name for the owner account
- **Plan** (select: free / starter / pro) — default: free
- **Max seats** (number, required, min: 1, default: 1) — how many team members this tenant can have (including the owner). This controls pricing: a clinic with 1 seat costs less than one with 10 seats. The owner counts as 1 seat.
- **Send invite email** (checkbox, default: checked)

On submit:
1. Create tenant document (include `max_seats` field)
2. Create user document (with `password_hash: null`, `status: 'pending_invite'`)
3. Link user to tenant as `owner` via team_members
4. Generate invite token (random UUID, stored in `invite_tokens` collection with 48h expiry)
5. If checkbox checked: send invite email via Resend
6. Redirect to tenant detail page

### Create `app/(admin)/admin/tenants/[id]/page.tsx` (Tenant detail):
- Tenant info (name, plan, status, created date, **max_seats with current usage count**)
- Owner info
- Team members list (show `X / max_seats` active members)
- Actions: Change plan, **Change max_seats**, Suspend tenant, Resend invite, Add user
- "Add User" button → same invite flow but for staff (role: staff)
- **Max seats display:** Show "Seats: 3 / 5 used" prominently. If at limit, show warning.
- **Change max_seats:** Super-admin can increase or decrease. If decreased below current active count, show a warning: "There are currently X active members. No new invites will be allowed until members are removed." but allow the change.

### API routes for admin:

**`app/api/admin/tenants/route.ts`:**
- GET: List tenants with search/filter/pagination (super_admin only)
- POST: Create tenant + owner user + send invite

**`app/api/admin/tenants/[id]/route.ts`:**
- GET: Single tenant with members + current seat usage (count of active/pending team_members)
- PATCH: Update plan, status, name, **max_seats** (allow reducing below current count — just blocks future invites)
- DELETE: Soft-delete (set status: 'suspended')

**`app/api/admin/tenants/[id]/users/route.ts`:**
- GET: List users in tenant
- POST: Add user to tenant (creates user + sends invite)

**`app/api/admin/tenants/[id]/resend-invite/route.ts`:**
- POST: Resend invite email for a pending user

**`app/api/admin/stats/route.ts`:**
- GET: Dashboard stats (total tenants, users, plans breakdown)

### ALL admin routes must:
```typescript
import { getSuperAdmin } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
  await getSuperAdmin();  // Throws 403 if not super_admin
  // ... rest of handler
}
```

### Tenant document schema (for reference):
```typescript
{
  _id: ObjectId,
  name: string,              // "Cabinet Dr. Popescu"
  slug: string,              // "cabinet-dr-popescu"
  owner_id: ObjectId,        // Links to users collection
  plan: 'free' | 'starter' | 'pro',
  max_seats: number,         // Set by super-admin. Min 1. Controls how many team members allowed.
  status: 'active' | 'suspended',
  settings: { timezone, currency, working_hours },
  created_at: Date,
  updated_at: Date,
}
```

### Acceptance criteria:
- [x] `/admin` redirects to login if not authenticated
- [x] `/admin` shows 403 if authenticated but not super_admin
- [x] Dashboard shows tenant/user counts
- [x] Tenant list with search and filter works
- [x] "Create Tenant" flow creates tenant (with `max_seats`) + user + sends invite email
- [x] `max_seats` field required on tenant creation (min: 1, default: 1)
- [x] Tenant detail shows members and seat usage (e.g. "3 / 5 seats used")
- [x] Super-admin can change `max_seats` (increase or decrease)
- [x] Decreasing `max_seats` below current active count is allowed but shows warning
- [x] Plan change works
- [x] Suspend/unsuspend works
- [x] Resend invite works
- [x] Build passes

---

## Task 1.5: Create the invite token system

### Create `lib/invite.ts`:
```typescript
import crypto from 'crypto';
import { getMongoDbOrThrow } from '@/lib/db/mongo';
import { ObjectId } from 'mongodb';
import { sendEmail } from '@/lib/email';

interface InviteToken {
  _id: ObjectId;
  token: string;
  email: string;
  user_id: ObjectId;
  tenant_id: ObjectId;
  role: string;
  expires_at: Date;
  used_at: Date | null;
  created_by: ObjectId;
  created_at: Date;
}

export async function createInviteToken(
  email: string,
  userId: ObjectId,
  tenantId: ObjectId,
  role: string,
  createdBy: ObjectId,
): Promise<string> {
  const db = await getMongoDbOrThrow();
  const token = crypto.randomBytes(32).toString('hex');

  await db.collection('invite_tokens').insertOne({
    token,
    email: email.toLowerCase(),
    user_id: userId,
    tenant_id: tenantId,
    role,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),  // 48 hours
    used_at: null,
    created_by: createdBy,
    created_at: new Date(),
  });

  return token;
}

export async function validateInviteToken(token: string): Promise<InviteToken | null> {
  const db = await getMongoDbOrThrow();
  const invite = await db.collection('invite_tokens').findOne({
    token,
    used_at: null,
    expires_at: { $gt: new Date() },
  });
  return invite as InviteToken | null;
}

export async function markInviteUsed(token: string): Promise<void> {
  const db = await getMongoDbOrThrow();
  await db.collection('invite_tokens').updateOne(
    { token },
    { $set: { used_at: new Date() } }
  );
}

export async function sendInviteEmail(
  email: string,
  name: string,
  tenantName: string,
  token: string,
) {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL || 'http://localhost:3000';
  const inviteUrl = `${baseUrl}/invite/${token}`;

  await sendEmail({
    to: email,
    subject: `Ai fost invitat pe ${tenantName}`,
    html: `
      <h2>Bine ai venit!</h2>
      <p>Salut ${name},</p>
      <p>Ai fost invitat sa te alături platformei <strong>${tenantName}</strong>.</p>
      <p>Click pe link-ul de mai jos pentru a-ți seta parola:</p>
      <p><a href="${inviteUrl}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Setează parola</a></p>
      <p>Link-ul expiră în 48 de ore.</p>
      <p style="color:#666;font-size:13px;">Dacă nu ai solicitat această invitație, ignoră acest email.</p>
    `,
  });
}
```

### Create `lib/email.ts` (if not already from Phase 3):
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[EMAIL] RESEND_API_KEY not set. Would have sent:', options.to, options.subject);
    console.warn('[EMAIL] Invite URL is in the log above (for dev testing)');
    return null;
  }

  return resend.emails.send({
    from: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
    ...options,
  });
}
```

### Add MongoDB index:
```javascript
db.invite_tokens.createIndex({ token: 1 }, { unique: true });
db.invite_tokens.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });  // Auto-delete expired
db.invite_tokens.createIndex({ email: 1, used_at: 1 });
```

### Acceptance criteria:
- [x] `lib/invite.ts` exists with create/validate/markUsed/sendEmail functions
- [x] Tokens are 32 random bytes (hex encoded)
- [x] Tokens expire after 48 hours
- [x] Expired tokens auto-deleted by MongoDB TTL index
- [x] Email includes Romanian text and a clear CTA button
- [x] Graceful fallback when RESEND_API_KEY not set (logs to console for dev)
- [x] Build passes

---

## Task 1.6: Create the "Set Password" page (invite acceptance)

### Create `app/(auth)/invite/[token]/page.tsx`:

This is the page clinic owners and staff land on from the invite email.

**Flow:**
1. Page loads → calls API to validate token
2. If token invalid/expired → show error: "Link-ul a expirat. Contactează administratorul."
3. If token valid → show form with:
   - Email (read-only, pre-filled from token)
   - Name (read-only, pre-filled)
   - Tenant name (displayed as context: "Te alături la: Cabinet Dr. Popescu")
   - Password (input)
   - Confirm password (input)
   - Submit button: "Setează parola"
4. On submit → calls API to set password
5. On success → redirect to `/login` with success message: "Parola a fost setată. Te poți autentifica."

### Create `app/api/invite/[token]/route.ts`:

**GET:** Validate token, return email + name + tenant name (for pre-filling the form)
```typescript
export async function GET(request, { params }) {
  const invite = await validateInviteToken(params.token);
  if (!invite) {
    return createErrorResponse('Invalid or expired invite', 404);
  }

  const db = await getMongoDbOrThrow();
  const user = await db.collection('users').findOne({ _id: invite.user_id });
  const tenant = await db.collection('tenants').findOne({ _id: invite.tenant_id });

  return createSuccessResponse({
    email: invite.email,
    name: user?.name || '',
    tenantName: tenant?.name || '',
    role: invite.role,
  });
}
```

**POST:** Set password and activate user
```typescript
export async function POST(request, { params }) {
  const { password } = await request.json();

  // Validate password (min 8 chars)
  if (!password || password.length < 8) {
    return createErrorResponse('Password must be at least 8 characters', 400);
  }

  const invite = await validateInviteToken(params.token);
  if (!invite) {
    return createErrorResponse('Invalid or expired invite', 404);
  }

  const db = await getMongoDbOrThrow();
  const passwordHash = await bcrypt.hash(password, 12);

  // Set password and activate user
  await db.collection('users').updateOne(
    { _id: invite.user_id },
    {
      $set: {
        password_hash: passwordHash,
        status: 'active',
        updated_at: new Date(),
      }
    }
  );

  // Activate team membership
  await db.collection('team_members').updateOne(
    { user_id: invite.user_id, tenant_id: invite.tenant_id },
    { $set: { accepted_at: new Date(), status: 'active' } }
  );

  // Mark token as used
  await markInviteUsed(params.token);

  return createSuccessResponse({ message: 'Password set successfully' });
}
```

### Acceptance criteria:
- [x] `/invite/{token}` page renders with pre-filled email and tenant name
- [x] Expired/invalid token shows clear error message
- [x] Password validation: minimum 8 characters
- [x] Password confirmation must match
- [x] After setting password, user status changes to 'active'
- [x] Token is marked as used (can't be reused)
- [x] Redirects to `/login` with success message
- [x] Build passes

---

## Task 1.7: Create the login page

### Create `app/(auth)/login/page.tsx`:
- Email + password form
- Error display for invalid credentials
- On success, redirect based on role:
  - `super_admin` → `/admin`
  - Everyone else → `/dashboard` (or `/calendar`, whichever is the main app page)
- NO register link (invite-only platform)
- NO "forgot password" for now (add later — admin can resend invite)
- Simple, clean design matching the app's CSS Modules

### Create `app/(auth)/layout.tsx`:
- Centered layout (no sidebar, no top nav)
- Just the app logo/name + the form
- No navigation links to the main app

### Acceptance criteria:
- [x] `/login` renders with email + password form
- [x] Invalid credentials show error message
- [x] Super-admin redirects to `/admin` after login
- [x] Tenant users redirect to `/dashboard` after login
- [x] No registration link anywhere
- [x] Build passes

---

## Task 1.8: Protect all routes with auth middleware

### Update `middleware.ts`:

```typescript
import { auth } from '@/lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth required
  const publicPaths = [
    '/login',
    '/invite/',           // Invite acceptance pages
    '/api/auth',          // NextAuth endpoints
    '/api/invite/',       // Invite validation/acceptance API
    '/api/webhooks',      // External webhooks (Facebook, email)
    '/api/health',
  ];

  const isPublic = publicPaths.some(path => pathname.startsWith(path));

  if (isPublic || pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  // Check authentication
  const session = await auth();

  if (!session) {
    if (pathname.startsWith('/api')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Super-admin route protection
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (session.user.role !== 'super_admin') {
      if (pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // Tenant routes — must have tenant_id
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin')) {
    if (!session.user.tenantId) {
      // Super-admin browsing tenant routes without a tenant context
      if (pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'No tenant context' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  // ... existing rate limiting logic (keep it, will be upgraded in Phase 3) ...

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

### Acceptance criteria:
- [x] Unauthenticated → API returns 401, pages redirect to `/login`
- [x] Non-super-admin accessing `/admin` → redirected to `/dashboard`
- [x] Super-admin accessing `/admin` → allowed
- [x] User without tenant accessing tenant routes → blocked
- [x] `/login`, `/invite/*`, `/api/auth/*`, `/api/webhooks/*` → public
- [x] Build passes

---

## Task 1.9: Replace ALL `DEFAULT_USER_ID` with session user

### Pattern — API routes:
```typescript
// BEFORE:
import { DEFAULT_USER_ID } from '@/lib/constants';
const userId = parseInt(searchParams.get('userId') || String(DEFAULT_USER_ID));

// AFTER:
import { getAuthUser } from '@/lib/auth-helpers';
const { userId, tenantId } = await getAuthUser();
```

### Pattern — Server Components (pages):
```typescript
// BEFORE:
const userId = 1;

// AFTER:
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
const session = await auth();
if (!session) redirect('/login');
const userId = session.user.id;
```

### Pattern — Client Components:
```typescript
// BEFORE:
const userId = 1;

// AFTER:
import { useSession } from 'next-auth/react';
const { data: session } = useSession();
const userId = session?.user?.id;
```

### Files to update (ALL of these — same list as before):
```
lib/constants.ts                  — Remove DEFAULT_USER_ID entirely
lib/validation.ts                 — Remove .default(1) from userId in ALL schemas
lib/server/clients.ts             — Use session userId
lib/server/calendar.ts            — Use session userId
app/api/clients/route.ts          — Use getAuthUser()
app/api/clients/[id]/route.ts     — Use getAuthUser()
app/api/clients/export/route.ts   — Use getAuthUser()
app/api/appointments/route.ts     — Use getAuthUser()
app/api/appointments/[id]/route.ts— Use getAuthUser()
app/api/webhooks/email/route.ts   — Special: use webhook context, not session
app/calendar/page.tsx             — Use session
app/calendar/CalendarPageClient.tsx — Use session via props or useSession
app/inbox/page.tsx                — Use session
app/inbox/InboxPageClient.tsx     — Use session via props or useSession
app/settings/email/page.tsx       — Use session
app/settings/email/EmailSettingsPageClient.tsx — Use session
app/api/settings/email-integrations/route.ts — Use getAuthUser()
app/api/settings/email-integrations/yahoo/route.ts — Use getAuthUser()
app/api/settings/email-integrations/[id]/route.ts — Use getAuthUser()
app/api/settings/email-integrations/[id]/test/route.ts — Use getAuthUser()
app/api/settings/email-integrations/[id]/fetch-last-email/route.ts — Use getAuthUser()
```

### Also:
- Wrap `app/layout.tsx` with `SessionProvider` from `next-auth/react`
- **Delete** `DEFAULT_USER_ID` from `lib/constants.ts`
- Remove all `userId` query parameter parsing from validation schemas

### Acceptance criteria:
- [x] `DEFAULT_USER_ID` no longer exists in any file
- [x] Zero references to `.default(1)` in validation schemas
- [x] All API routes use `getAuthUser()` or `getSuperAdmin()`
- [x] All pages use session for user identity
- [x] `app/layout.tsx` wrapped with `SessionProvider`
- [x] Build passes

---

## Task 1.10: Update error handler for AuthError

### Update `lib/error-handler.ts`:
```typescript
import { AuthError } from '@/lib/auth-helpers';

export function handleApiError(error: unknown, context: string) {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }  // 401 or 403
    );
  }
  // ... existing error handling
}
```

### Acceptance criteria:
- [x] AuthError with status 401 returns 401
- [x] AuthError with status 403 returns 403
- [x] Other errors still return appropriate codes
- [x] Build passes

---

## Summary of pages and routes created

### Pages:
```
app/(auth)/login/page.tsx                 — Login form (email + password)
app/(auth)/invite/[token]/page.tsx        — Set password form (from invite)
app/(auth)/layout.tsx                     — Centered auth layout

app/(admin)/admin/page.tsx                — Super-admin dashboard
app/(admin)/admin/layout.tsx              — Admin layout with sidebar
app/(admin)/admin/tenants/page.tsx        — Tenant list + search
app/(admin)/admin/tenants/new/page.tsx    — Create tenant form
app/(admin)/admin/tenants/[id]/page.tsx   — Tenant detail + members
```

### API routes:
```
app/api/auth/[...nextauth]/route.ts       — NextAuth handlers
app/api/invite/[token]/route.ts           — GET validate + POST set password
app/api/admin/stats/route.ts              — GET dashboard stats
app/api/admin/tenants/route.ts            — GET list + POST create
app/api/admin/tenants/[id]/route.ts       — GET detail + PATCH update
app/api/admin/tenants/[id]/users/route.ts — GET members + POST add user
app/api/admin/tenants/[id]/resend-invite/route.ts — POST resend
```

### Lib files:
```
lib/auth.ts                               — NextAuth config
lib/auth-helpers.ts                       — getAuthUser, getSuperAdmin, requireRole
lib/invite.ts                             — Token creation, validation, email sending
lib/email.ts                              — Resend email wrapper
types/next-auth.d.ts                      — Extended session types
```

### Scripts:
```
scripts/create-super-admin.ts             — One-time super-admin creation
```

---

## Final Verification

```bash
npm run build && npx tsc --noEmit

# Super-admin script works:
npm run admin:create -- test@test.com TestPassword123 "Test Admin"

# Auth files exist:
ls lib/auth.ts lib/auth-helpers.ts lib/invite.ts lib/email.ts

# No hardcoded user IDs:
grep -r "DEFAULT_USER_ID" --include="*.ts" --include="*.tsx" lib/ app/
# Should return 0

grep -r "\.default(1)" --include="*.ts" lib/validation.ts
# Should return 0

# Admin routes exist:
ls app/\(admin\)/admin/page.tsx
ls app/api/admin/tenants/route.ts

# Invite routes exist:
ls app/\(auth\)/invite/\[token\]/page.tsx
ls app/api/invite/\[token\]/route.ts
```

Commit:
```bash
git add -A && git commit -m "PHASE-01: Add NextAuth v5 auth, invite-only onboarding, super-admin dashboard"
```

