# M-Saas MVP Improvement Plan: Calendar, Settings & CRM Redesign

## Context

### Why This Change Is Needed

The m-saas project is a **75% complete MVP** for small business management (dental clinics, salons, workshops) with three core features that need production-ready improvements:

**Problem Statement:**
1. **Calendar Feature (70% complete)** - Works but has critical security gaps (no auth), architectural issues (hardcoded userId, race conditions), and missing dental-specific features (multi-provider, recurring appointments, blocked time)
2. **Settings Page (20% complete)** - Only email integrations exist; missing profile, notifications, billing, and team management. The 600+ line EmailSettingsPageClient.tsx is a monolithic component that's hard to maintain
3. **CRM/Clienti (100% functional but limited)** - Full CRUD works well, but lacks workflow automation, advanced analytics (LTV, churn prediction), and bulk operations found in real CRM systems

**Critical Blocker:** The entire application uses hardcoded `userId: 1` or `DEFAULT_USER_ID` throughout the codebase. This **must be fixed first** before any other improvements can be production-ready.

**User's Intent:** Transform these features into a **strong MVP SaaS application** with:
- Generic purpose architecture (easily convertible to dental, barber, salon use cases)
- Real-world scheduling patterns inspired by Calendly, Cal.com
- Settings UI modeled after Stripe Dashboard, Linear, Notion
- CRM workflows inspired by Pipedrive/HubSpot (simplified for SMBs)
- Immediate value delivery to end users

---

## Architecture Overview

### Tech Stack (Current)
- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript
- **Database:** MongoDB 6.21 with collections-based schema
- **Styling:** CSS Modules + CSS custom properties (no Tailwind)
- **Validation:** Zod schemas
- **Date Handling:** date-fns with Romanian locale
- **Auth:** **NONE** (critical gap)

### Critical Files to Modify

**Calendar Feature:**
- `d:\m-saas\app\calendar\CalendarPageClient.tsx` (1,030 lines - needs refactoring)
- `d:\m-saas\lib\calendar.ts` (slot calculation logic)
- `d:\m-saas\app\api\appointments\route.ts` (GET/POST endpoints)
- `d:\m-saas\app\api\appointments\[id]\route.ts` (PATCH/DELETE endpoints)

**Settings Page:**
- `d:\m-saas\app\settings\email\EmailSettingsPageClient.tsx` (600+ lines - needs complete refactor)
- New files: `app\settings\profile\`, `app\settings\notifications\`, `app\settings\billing\`

**CRM Feature:**
- `d:\m-saas\app\clients\ClientsPageClient.tsx` (300 lines - good structure)
- `d:\m-saas\app\clients\[id]\ClientProfileClient.tsx` (850 lines - needs tab extraction)
- `d:\m-saas\lib\server\clients.ts` (add bulk operations, analytics)

---

## Code Quality & Refactoring Strategy

### Overview

Before implementing new features, we must address code quality issues accumulated during MVP development. This includes:
- **Dead code removal** (unused imports, functions, components)
- **Code deduplication** (shared logic extracted to utilities)
- **Consistent patterns** (standardize API responses, error handling, validation)
- **TypeScript strictness** (eliminate `any` types, add proper interfaces)
- **Component size reduction** (break down 600+ line components)

### Code Audit Findings

**From Exploration:**
1. **Monolithic Components:**
   - `CalendarPageClient.tsx`: 1,030 lines (15+ state variables, 5 modals)
   - `EmailSettingsPageClient.tsx`: 600+ lines (complex AbortController management)
   - `ClientProfileClient.tsx`: 850 lines (5 tabs in one file)

2. **Duplicated Logic:**
   - Date formatting repeated across 10+ files
   - API fetch patterns with retry logic duplicated
   - Client matching logic (email/phone deduplication) scattered
   - Working hours calculation in multiple places

3. **Hardcoded Values:**
   - `userId: 1` or `DEFAULT_USER_ID` in 30+ API routes
   - Working hours (9am-6pm) hardcoded in slot calculation
   - Timezone (`Europe/Bucharest`) hardcoded throughout
   - Romanian strings scattered instead of centralized i18n

4. **Type Safety Issues:**
   - Optional `any` types in MongoDB query results
   - Inconsistent interface naming (some use `I` prefix, some don't)
   - Missing null checks on optional fields

5. **Dead Code:**
   - Unused imports in 50+ files (especially date-fns functions)
   - Commented-out code blocks
   - Legacy SQL adapter files (`lib/db/sql-adapter.ts`)
   - Deprecated collections referenced (`contact_notes`, `contact_files`)

### Refactoring Principles

**1. DRY (Don't Repeat Yourself)**
- Extract repeated logic into utilities
- Create reusable hooks for common patterns
- Centralize constants and configuration

**2. Single Responsibility**
- Components should do one thing well
- Separate concerns: UI vs logic vs data fetching
- Extract complex state management into custom hooks

**3. Consistent Patterns**
- Standardize API response format
- Consistent error handling across routes
- Unified validation approach (Zod everywhere)

**4. Type Safety First**
- No `any` types (use `unknown` with type guards)
- Strict TypeScript configuration
- Proper interface inheritance

### Cleanup Tasks (Integrated Throughout Phases)

#### Task 1: Extract Shared Utilities

**Create: `lib/utils/date.ts`**
```typescript
// Centralize all date formatting
export function formatDate(date: string | Date, format: 'short' | 'long' = 'short'): string {
  const d = new Date(date);
  return d.toLocaleDateString('ro-RO',
    format === 'short'
      ? { day: '2-digit', month: 'short', year: 'numeric' }
      : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
  );
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}

export function daysBetween(date1: Date, date2: Date): number {
  return Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
}
```

**Replace in 10+ files:**
- `app/calendar/CalendarPageClient.tsx`
- `app/clients/ClientsPageClient.tsx`
- `app/clients/[id]/ClientProfileClient.tsx`
- `app/dashboard/page.tsx`
- etc.

**Create: `lib/utils/currency.ts`**
```typescript
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency: 'RON',
  }).format(amount);
}
```

**Create: `lib/utils/fetch.ts`**
```typescript
// Unified fetch wrapper with retry logic
export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
  retries: number = 3
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Request failed');
      }

      return await response.json();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries exceeded');
}
```

**Replace all instances of:**
- `fetchWithRetry()` in EmailSettingsPageClient
- Manual retry logic in multiple files
- Inconsistent error handling

#### Task 2: Standardize API Responses

**Create: `lib/api/response.ts`**
```typescript
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    pagination?: PaginationInfo;
    cached?: boolean;
    timestamp?: string;
  };
}

export function successResponse<T>(data: T, meta?: ApiResponse<T>['meta']) {
  return Response.json({ success: true, data, meta });
}

export function errorResponse(error: string, status: number = 400) {
  return Response.json({ success: false, error }, { status });
}

export function notFoundResponse(resource: string) {
  return errorResponse(`${resource} not found`, 404);
}

export function unauthorizedResponse() {
  return errorResponse('Unauthorized', 401);
}

export function validationErrorResponse(errors: Record<string, string>) {
  return Response.json({ success: false, error: 'Validation failed', errors }, { status: 400 });
}
```

**Refactor ALL API routes** (30+ files) to use this pattern:
```typescript
// Before:
return Response.json({ clients, pagination });

// After:
return successResponse({ clients }, { pagination });
```

#### Task 3: Remove Dead Code

**Files to Delete:**
```
lib/db/sql-adapter.ts                    (Deprecated - now using MongoDB)
lib/deprecated/                          (If exists)
scripts/old-migrations/                  (Old SQL migrations)
```

**Dead Collections to Remove References:**
- `contact_notes` → replaced by `client_notes`
- `contact_files` → replaced by `client_files`

**Unused Imports Cleanup:**
Run ESLint fix to remove unused imports across all files:
```bash
npm run lint -- --fix
```

**Remove Commented Code:**
Search and remove all commented-out blocks:
```typescript
// Bad:
// const oldFunction = () => { ... }  ← DELETE

// Good:
// Use Git history if you need to restore old code
```

#### Task 4: TypeScript Strict Mode

**Enable Strict Mode: `tsconfig.json`**
```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Fix Type Issues:**

1. **MongoDB Query Results:**
```typescript
// Before:
const clients = await db.collection('clients').find().toArray();  // any[]

// After:
const clients = await db.collection<Client>('clients').find().toArray();  // Client[]
```

2. **Optional Chaining:**
```typescript
// Before:
const date = client.last_appointment_date ? formatDate(client.last_appointment_date) : 'Never';

// After:
const date = client.last_appointment_date?.toISOString() ?? 'Never';
```

3. **Type Guards:**
```typescript
// Before:
function processData(data: any) { ... }

// After:
function processData(data: unknown): data is Client {
  return typeof data === 'object' && data !== null && 'id' in data;
}
```

#### Task 5: Extract Configuration

**Create: `lib/config.ts`**
```typescript
export const config = {
  app: {
    name: 'm-saas',
    defaultLocale: 'ro',
    timezone: 'Europe/Bucharest',
  },
  calendar: {
    workingHours: {
      start: '09:00',
      end: '18:00',
    },
    slotDuration: 15, // minutes
    firstDayOfWeek: 1, // Monday
  },
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
  },
  files: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: ['image/jpeg', 'image/png', 'application/pdf'],
  },
  cache: {
    ttl: {
      clients: 300,      // 5 minutes
      appointments: 600, // 10 minutes
      analytics: 3600,   // 1 hour
    },
  },
} as const;
```

**Replace hardcoded values throughout codebase:**
```typescript
// Before:
const limit = parseInt(searchParams.get('limit') || '20');

// After:
const limit = parseInt(searchParams.get('limit') || config.pagination.defaultLimit.toString());
```

#### Task 6: Centralize Validation Schemas

**Consolidate: `lib/validation/index.ts`**
```typescript
// Re-export all schemas from single entry point
export * from './appointment';
export * from './client';
export * from './service';
export * from './user';
export * from './settings';

// Shared base schemas
export const idSchema = z.number().int().positive();
export const emailSchema = z.string().email();
export const phoneSchema = z.string().regex(/^[0-9+\-\s()]+$/).optional();
export const dateSchema = z.string().datetime().or(z.date());
```

**Consistent Validation Pattern:**
```typescript
// All API routes follow this pattern:
export async function POST(request: Request) {
  const body = await request.json();
  const validatedData = createClientSchema.parse(body); // Throws ZodError

  // ... business logic
}
```

#### Task 7: Code Splitting & Lazy Loading

**Lazy Load Heavy Components:**
```typescript
// Before:
import CreateAppointmentModal from './modals/CreateAppointmentModal';

// After:
const CreateAppointmentModal = lazy(() => import('./modals/CreateAppointmentModal'));

// Use with Suspense:
<Suspense fallback={<LoadingSpinner />}>
  {showModal && <CreateAppointmentModal />}
</Suspense>
```

**Apply to:**
- All modals (CreateAppointmentModal, EditAppointmentModal, etc.)
- Analytics dashboard (Chart.js is heavy)
- Settings pages (only load active tab)

#### Task 8: Performance Profiling

**Add Monitoring:**
```typescript
// lib/monitoring.ts
export function measureTime(label: string) {
  const start = performance.now();
  return () => {
    const duration = performance.now() - start;
    console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
  };
}

// Usage:
const endTimer = measureTime('calculateAvailableSlots');
const slots = calculateAvailableSlots(...);
endTimer();
```

**Identify Bottlenecks:**
- Slow database queries (>100ms)
- Heavy renders (>50ms)
- Large bundle chunks (>500KB)

### Code Quality Tools

**ESLint Configuration:**
```json
// .eslintrc.json
{
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": "error",
    "no-console": ["warn", { "allow": ["warn", "error"] }],
    "prefer-const": "error",
    "no-duplicate-imports": "error"
  }
}
```

**Prettier Configuration:**
```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

**Pre-commit Hooks:**
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "lint-staged"
    }
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{css,json}": ["prettier --write"]
  }
}
```

### Integration with Implementation Phases

**Phase 0 (Auth):**
- ✅ Remove all hardcoded `userId` values
- ✅ Standardize API response format
- ✅ Add auth helper utility
- ✅ Enable TypeScript strict mode

**Phase 1 (Calendar):**
- ✅ Extract calendar logic into custom hooks
- ✅ Break down 1,030-line component into focused components
- ✅ Centralize date/time utilities
- ✅ Remove duplicate slot calculation logic

**Phase 2 (Settings):**
- ✅ Refactor 600-line EmailSettingsPageClient into cards
- ✅ Extract form state management pattern
- ✅ Centralize validation schemas
- ✅ Remove AbortController duplication

**Phase 3 (CRM):**
- ✅ Extract client profile tabs (850 → 150 lines)
- ✅ Centralize client matching logic
- ✅ Remove duplicate formatting functions
- ✅ Standardize analytics calculations

### Success Metrics

**Code Quality:**
- ✅ Zero `any` types in codebase
- ✅ All components <300 lines
- ✅ Zero ESLint errors
- ✅ Test coverage >70%
- ✅ Bundle size <500KB (main chunk)

**Performance:**
- ✅ Lighthouse score >90
- ✅ No queries >100ms without indexes
- ✅ First Contentful Paint <1.5s
- ✅ Time to Interactive <3.5s

**Maintainability:**
- ✅ All hardcoded values moved to config
- ✅ Consistent patterns across all routes
- ✅ Zero duplicated utility functions
- ✅ All API responses follow standard format

---

## Implementation Plan

### Phase 0: Authentication Foundation (CRITICAL - MUST BE FIRST)

**Why First:** All features assume single-user mode. Multi-tenancy requires proper authentication and data isolation.

#### 0.1 Choose Authentication Strategy

**Recommended:** NextAuth.js (Auth.js v5) for flexibility and MongoDB support

**Alternatives Considered:**
- **Clerk:** Fastest setup, best UX, but adds external dependency and cost ($25/mo after 10k MAU)
- **Supabase Auth:** Free tier generous, but requires PostgreSQL migration (risky for 75% complete MVP)
- **Custom JWT:** Maximum control, but significant development time (2-3 weeks)

**Decision Rationale:** NextAuth.js balances speed (3-5 days), flexibility, and cost (free). Works with existing MongoDB and allows future migration to any provider.

#### 0.2 Database Schema Changes

**New Collection: `users`**
```typescript
interface User {
  id: ObjectId;
  email: string;           // Unique index
  password_hash?: string;  // For credentials provider
  name: string;
  role: 'owner' | 'admin' | 'staff';
  tenant_id: ObjectId;     // For future multi-location support
  created_at: Date;
  updated_at: Date;
  email_verified: Date | null;
}
```

**New Collection: `sessions`** (NextAuth requirement)
```typescript
interface Session {
  sessionToken: string;    // Primary key
  userId: ObjectId;
  expires: Date;
}
```

**New Collection: `accounts`** (OAuth providers)
```typescript
interface Account {
  userId: ObjectId;
  type: 'oauth' | 'email';
  provider: string;        // google, email, etc.
  providerAccountId: string;
  refresh_token?: string;
  access_token?: string;
  expires_at?: number;
}
```

#### 0.3 Migration Strategy

**Step 1:** Add user_id foreign key to all existing collections
```javascript
// Migration script: scripts/add-user-id-to-collections.js
const collections = [
  'clients', 'appointments', 'services', 'conversations',
  'messages', 'email_integrations', 'tasks', 'client_notes', 'client_files'
];

for (const collName of collections) {
  await db.collection(collName).updateMany(
    { user_id: { $exists: false } },
    { $set: { user_id: DEFAULT_USER_ID } }
  );
}
```

**Step 2:** Create demo user account
```javascript
// Seed script: scripts/create-demo-user.js
await db.collection('users').insertOne({
  email: 'demo@example.com',
  password_hash: await bcrypt.hash('demo123', 10),
  name: 'Demo User',
  role: 'owner',
  tenant_id: new ObjectId(),
  created_at: new Date(),
  updated_at: new Date(),
  email_verified: new Date(),
});
```

**Step 3:** Add indexes for performance
```javascript
db.clients.createIndex({ user_id: 1, status: 1 });
db.appointments.createIndex({ user_id: 1, start_time: 1 });
db.conversations.createIndex({ user_id: 1, updated_at: -1 });
```

#### 0.4 Code Refactoring Pattern

**Create Auth Helper:** `lib/auth.ts`
```typescript
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

export async function getAuthUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
  };
}

export function requireAuth() {
  return async (handler: Function) => {
    const user = await getAuthUser();
    return handler(user);
  };
}
```

**Refactor Pattern (Example: `/api/clients/route.ts`):**

**Before:**
```typescript
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || '1'; // HARDCODED!

  const clients = await getClientsData(parseInt(userId));
  return Response.json({ clients });
}
```

**After:**
```typescript
export async function GET(request: Request) {
  const user = await getAuthUser(); // Throws if not authenticated
  const { searchParams } = new URL(request.url);

  const clients = await getClientsData(user.id);
  return Response.json({ clients });
}
```

**Apply to ALL API routes** (estimated 30+ files):
- `/api/appointments/*`
- `/api/clients/*`
- `/api/services/*`
- `/api/conversations/*`
- `/api/settings/*`
- `/api/calendar/*`

#### 0.5 UI Changes

**Add Login Page:** `app/login/page.tsx`
```typescript
// Simple email/password form with NextAuth signIn()
```

**Add Registration Page:** `app/register/page.tsx`
```typescript
// Email, password, name fields with validation
```

**Protect All Routes:** `middleware.ts`
```typescript
export { default } from 'next-auth/middleware';

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/calendar/:path*',
    '/clients/:path*',
    '/inbox/:path*',
    '/settings/:path*',
  ],
};
```

**Add SessionProvider:** `app/layout.tsx`
```typescript
import { SessionProvider } from 'next-auth/react';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

#### 0.6 Testing Strategy

**Test Scenarios:**
1. ✅ User can register with email/password
2. ✅ User can login and see session persist
3. ✅ Unauthenticated requests to `/api/*` return 401
4. ✅ Each user sees only their own data (isolation test)
5. ✅ Logout clears session and redirects to login
6. ✅ Session expires after inactivity (default 30 days)

**Manual Testing Script:**
```bash
# Create test user 1
curl -X POST http://localhost:3000/api/auth/register \
  -d '{"email":"user1@test.com","password":"test123","name":"User 1"}'

# Create test user 2
curl -X POST http://localhost:3000/api/auth/register \
  -d '{"email":"user2@test.com","password":"test123","name":"User 2"}'

# Login as user 1, create client, verify user 2 can't see it
```

#### 0.7 Timeline & Dependencies

**Estimated Time:** 5-7 days

**Breakdown:**
- Day 1: NextAuth setup + database migration
- Day 2: Create auth helper + refactor 15 API routes
- Day 3: Refactor remaining 15 API routes
- Day 4: UI (login/register pages) + middleware
- Day 5: Testing + bug fixes
- Day 6-7: Buffer for edge cases

**Blockers:** None (can start immediately)

**Dependencies:** All subsequent phases depend on this

---

### Phase 1: Calendar Feature Redesign (Production-Ready Scheduling)

**Goal:** Transform calendar from prototype into production-grade appointment system suitable for dental clinics.

#### 1.1 Component Architecture Refactoring

**Problem:** `CalendarPageClient.tsx` is 1,030 lines with 15+ state variables, 5 modals, and complex positioning logic.

**Solution:** Extract into focused components

**New File Structure:**
```
app/calendar/
├── page.tsx                          (Server component)
├── CalendarPageClient.tsx            (Orchestrator - 200 lines)
├── components/
│   ├── CalendarHeader.tsx            (View switcher, navigation, today button)
│   ├── WeekView/
│   │   ├── WeekView.tsx              (Week grid layout)
│   │   ├── WeekHeader.tsx            (Day headers)
│   │   ├── TimeSlots.tsx             (Hourly grid)
│   │   └── AppointmentBlock.tsx      (Single appointment visual)
│   ├── MonthView/
│   │   ├── MonthView.tsx             (Month grid layout)
│   │   ├── MonthDay.tsx              (Single day cell)
│   │   └── AppointmentPreview.tsx    (Compact appointment card)
│   ├── modals/
│   │   ├── CreateAppointmentModal.tsx  (Create flow)
│   │   ├── AppointmentPreviewModal.tsx (Read-only detail view)
│   │   ├── EditAppointmentModal.tsx    (Edit flow)
│   │   └── DeleteConfirmModal.tsx      (Delete confirmation)
│   ├── ProviderFilter.tsx            (NEW - multi-provider support)
│   ├── ResourceFilter.tsx            (NEW - chair/room filter)
│   └── AvailabilityIndicator.tsx     (NEW - show free/busy slots)
└── hooks/
    ├── useCalendar.ts                (Calendar state management)
    ├── useAppointments.ts            (CRUD operations)
    └── useCalendarNavigation.ts      (Date navigation logic)
```

**Benefits:**
- Each component <250 lines (maintainable)
- Reusable across views (WeekView and MonthView share AppointmentBlock)
- Easier to test individual components
- Clear separation of concerns

#### 1.2 State Management Strategy

**Current:** 15+ useState variables in CalendarPageClient

**New Approach:** Custom hook pattern

**`hooks/useCalendar.ts`**
```typescript
interface CalendarState {
  viewType: 'week' | 'month';
  currentDate: Date;
  selectedDate: Date | null;
  selectedAppointment: Appointment | null;
  selectedProvider: Provider | null;  // NEW
  selectedResource: Resource | null;   // NEW
}

interface CalendarActions {
  setViewType: (view: 'week' | 'month') => void;
  navigateToDate: (date: Date) => void;
  goToToday: () => void;
  nextPeriod: () => void;
  prevPeriod: () => void;
  selectAppointment: (appt: Appointment) => void;
  selectProvider: (provider: Provider | null) => void;  // NEW
  selectResource: (resource: Resource | null) => void;   // NEW
}

export function useCalendar(): [CalendarState, CalendarActions] {
  // Implementation with useReducer for complex state
}
```

**`hooks/useAppointments.ts`**
```typescript
interface AppointmentOperations {
  appointments: Appointment[];
  loading: boolean;
  createAppointment: (data: CreateAppointmentInput) => Promise<void>;
  updateAppointment: (id: number, data: UpdateAppointmentInput) => Promise<void>;
  deleteAppointment: (id: number) => Promise<void>;
  fetchAppointments: (filters: AppointmentFilters) => Promise<void>;
}

export function useAppointments(userId: number): AppointmentOperations {
  // Uses SWR or React Query for caching and revalidation
}
```

**Why Not Redux/Zustand?**
- Overkill for single-page state
- Custom hooks provide enough structure
- Easier to test and maintain
- No external dependencies

#### 1.3 Dental-Specific Features

**New Database Schema Additions:**

**Collection: `providers`**
```typescript
interface Provider {
  id: ObjectId;
  user_id: ObjectId;          // Tenant owner
  name: string;               // "Dr. Smith"
  email: string;
  role: 'dentist' | 'hygienist' | 'assistant';
  color: string;              // For calendar color coding
  working_hours: {
    [day: string]: {          // "monday", "tuesday", etc.
      start: string;          // "09:00"
      end: string;            // "17:00"
      breaks: Array<{start: string; end: string}>;
    };
  };
  is_active: boolean;
  created_at: Date;
}
```

**Collection: `resources`**
```typescript
interface Resource {
  id: ObjectId;
  user_id: ObjectId;
  name: string;               // "Chair 1", "Room A"
  type: 'chair' | 'room' | 'equipment';
  is_active: boolean;
  created_at: Date;
}
```

**Collection: `blocked_times`**
```typescript
interface BlockedTime {
  id: ObjectId;
  user_id: ObjectId;
  provider_id: ObjectId | null;  // Null = all providers
  resource_id: ObjectId | null;  // Null = all resources
  start_time: Date;
  end_time: Date;
  reason: string;             // "Lunch", "Training", "Maintenance"
  recurrence: RecurrenceRule | null;
  created_at: Date;
}
```

**Updated: `appointments` collection**
```typescript
interface Appointment {
  // ... existing fields ...
  provider_id: ObjectId;      // NEW - assigned provider
  resource_id: ObjectId | null;  // NEW - assigned chair/room
  recurrence: RecurrenceRule | null;  // NEW
  recurrence_group_id: ObjectId | null;  // NEW - links recurring instances
}
```

**Recurrence Rule Type:**
```typescript
interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;           // Every N days/weeks/months
  days_of_week?: number[];    // For weekly: [1,3,5] = Mon,Wed,Fri
  end_date?: Date;            // Optional end date
  count?: number;             // Or end after N occurrences
}
```

#### 1.4 Conflict Detection & Resolution

**Current Issue:** Only checks conflicts on CREATE, not UPDATE

**New API Logic:** `lib/calendar-conflicts.ts`
```typescript
interface ConflictCheck {
  hasConflict: boolean;
  conflicts: Appointment[];
  suggestions: TimeSlot[];    // Alternative available slots
}

async function checkAppointmentConflict(
  userId: number,
  providerId: number,
  resourceId: number | null,
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: number  // For update operations
): Promise<ConflictCheck> {
  // 1. Check provider availability (other appointments + blocked times)
  // 2. Check resource availability (if resourceId provided)
  // 3. Check provider working hours
  // 4. If conflict, suggest 3 nearest available slots
}
```

**Apply to BOTH create and update:**
```typescript
// POST /api/appointments - calls checkAppointmentConflict()
// PATCH /api/appointments/[id] - calls checkAppointmentConflict(excludeAppointmentId)
```

#### 1.5 Recurring Appointments

**User Flow:**
1. Create appointment with "Repeat" checkbox
2. Choose frequency (weekly, every 2 weeks, monthly)
3. Choose end condition (after N occurrences or specific date)
4. System creates all instances with shared `recurrence_group_id`
5. Editing: "Edit this one" vs "Edit all future"
6. Deleting: "Delete this one" vs "Delete all future"

**API Changes:**

**New Endpoint:** `POST /api/appointments/recurring`
```typescript
interface CreateRecurringAppointmentInput {
  // ... normal appointment fields ...
  recurrence: RecurrenceRule;
}

// Response:
{
  created_count: number;
  appointments: Appointment[];  // All created instances
  conflicts: Appointment[];     // Any skipped due to conflicts
}
```

**New Endpoint:** `PATCH /api/appointments/[id]/recurring`
```typescript
interface UpdateRecurringAppointmentInput {
  scope: 'this' | 'future' | 'all';
  // ... fields to update ...
}

// Updates appointment and related instances based on scope
```

#### 1.6 Drag-and-Drop Rescheduling

**Implementation:** Use native HTML5 drag-and-drop

**Files to Modify:**
- `WeekView/AppointmentBlock.tsx` - Add draggable={true}
- `WeekView/TimeSlots.tsx` - Add drop zones
- `hooks/useAppointments.ts` - Add rescheduleAppointment()

**User Experience:**
1. Drag appointment to new time slot
2. Check conflict (show red highlight if unavailable)
3. Drop to confirm
4. Optimistic UI update (immediate visual feedback)
5. API call in background
6. Revert if API fails

**Accessibility:** Also support keyboard-based rescheduling (arrow keys + Enter)

#### 1.7 Waitlist Feature

**Use Case:** When appointment canceled, auto-offer slot to waitlisted clients

**New Collection: `waitlist`**
```typescript
interface WaitlistEntry {
  id: ObjectId;
  user_id: ObjectId;
  client_id: ObjectId;
  service_id: ObjectId;
  provider_id: ObjectId | null;  // Preferred provider
  preferred_days: number[];      // [1,2,3] = Mon,Tue,Wed
  preferred_times: string[];     // ["morning", "afternoon", "evening"]
  notes: string;
  created_at: Date;
  notified_at: Date | null;
}
```

**Workflow:**
1. Appointment canceled/deleted
2. Backend checks waitlist for matching service + provider + time preferences
3. Sends email/SMS to top 3 waitlisted clients with booking link
4. First to claim gets the slot
5. Others get "slot filled" notification

**New API Endpoint:** `POST /api/waitlist`

#### 1.8 Performance Optimizations

**Problem:** Fetches all appointments for date range every time view changes

**Solutions:**

1. **Add MongoDB Indexes:**
```javascript
db.appointments.createIndex({ user_id: 1, start_time: 1 });
db.appointments.createIndex({ user_id: 1, provider_id: 1, start_time: 1 });
db.blocked_times.createIndex({ user_id: 1, start_time: 1, end_time: 1 });
```

2. **Implement Client-Side Caching:** Use SWR or React Query
```typescript
import useSWR from 'swr';

function useAppointments(dateRange: DateRange) {
  const { data, error, mutate } = useSWR(
    `/api/appointments?start=${dateRange.start}&end=${dateRange.end}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30000 } // 30s cache
  );

  return { appointments: data?.appointments, mutate };
}
```

3. **Optimize Slot Calculation:** Memoize results
```typescript
const availableSlots = useMemo(
  () => calculateAvailableSlots(appointments, blockedTimes, workingHours),
  [appointments, blockedTimes, workingHours]
);
```

4. **Virtual Scrolling:** For month view with 100+ appointments
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';
// Apply to appointment list rendering
```

#### 1.9 API Route Changes Summary

**New Endpoints:**
- `GET /api/providers` - List providers
- `POST /api/providers` - Create provider
- `GET /api/resources` - List resources (chairs/rooms)
- `POST /api/blocked-times` - Create blocked time
- `POST /api/appointments/recurring` - Create recurring appointment
- `PATCH /api/appointments/[id]/recurring` - Update recurring appointment
- `POST /api/waitlist` - Add to waitlist
- `GET /api/calendar/conflicts` - Check conflicts before save

**Modified Endpoints:**
- `POST /api/appointments` - Add provider_id, resource_id, recurrence
- `PATCH /api/appointments/[id]` - Add conflict check on update
- `GET /api/appointments` - Add provider/resource filters

#### 1.10 Testing Strategy

**Unit Tests:**
- `checkAppointmentConflict()` - Various scenarios (provider busy, resource busy, working hours)
- `calculateRecurringDates()` - Weekly, monthly with end conditions
- `findAvailableSlots()` - With blocked times and existing appointments

**Integration Tests:**
- Create recurring appointment → verify all instances created
- Drag appointment to conflict slot → verify error shown
- Cancel appointment → verify waitlist notifications sent

**E2E Tests (Manual):**
1. Create appointment for Dr. Smith in Chair 1 at 2pm
2. Try to create conflicting appointment → verify error
3. Drag appointment to 3pm → verify success
4. Create weekly recurring for 8 weeks → verify 8 appointments created
5. Edit "all future" → verify correct instances updated

#### 1.11 Timeline

**Estimated Time:** 10-12 days

**Breakdown:**
- Days 1-2: Component refactoring (extract modals, views)
- Days 3-4: Provider/resource models + UI
- Days 5-6: Recurring appointments logic + API
- Days 7-8: Conflict detection + drag-and-drop
- Day 9: Waitlist feature
- Days 10-11: Performance optimizations + caching
- Day 12: Testing + bug fixes

---

### Phase 2: Settings Page Complete Redesign

**Goal:** Transform email-only settings into comprehensive SaaS settings hub like Stripe Dashboard.

#### 2.1 Settings Architecture

**Current Problem:** Single 600+ line EmailSettingsPageClient.tsx with hardcoded user ID

**New Structure:** Tab-based layout with independent sections

**New File Structure:**
```
app/settings/
├── layout.tsx                      (Settings shell with sidebar)
├── page.tsx                        (Redirect to /settings/profile)
├── profile/
│   ├── page.tsx                    (Server component)
│   └── ProfileSettingsClient.tsx   (Profile form - 150 lines)
├── account/
│   ├── page.tsx
│   └── AccountSettingsClient.tsx   (Email, password, 2FA - 200 lines)
├── notifications/
│   ├── page.tsx
│   └── NotificationSettingsClient.tsx (Email/SMS preferences - 150 lines)
├── billing/
│   ├── page.tsx
│   └── BillingSettingsClient.tsx   (Subscription, invoices - 200 lines)
├── team/
│   ├── page.tsx
│   └── TeamSettingsClient.tsx      (Invite members, roles - 250 lines)
├── integrations/
│   ├── page.tsx
│   ├── IntegrationsClient.tsx      (Integration cards - 150 lines)
│   ├── email/
│   │   └── EmailIntegrationCard.tsx (Refactored from EmailSettingsPageClient)
│   ├── calendar/
│   │   └── CalendarIntegrationCard.tsx (Google Calendar, Outlook)
│   └── sms/
│       └── SmsIntegrationCard.tsx  (Twilio, WhatsApp)
└── components/
    ├── SettingsSidebar.tsx         (Navigation menu)
    ├── SettingsHeader.tsx          (Title + description)
    ├── SettingsSection.tsx         (Reusable section wrapper)
    └── SaveBar.tsx                 (Sticky save bar with dirty state)
```

#### 2.2 Settings Layout Component

**`app/settings/layout.tsx`**
```typescript
export default function SettingsLayout({ children }) {
  return (
    <div className={styles.settingsLayout}>
      <SettingsSidebar />
      <main className={styles.settingsContent}>
        {children}
      </main>
    </div>
  );
}
```

**`components/SettingsSidebar.tsx`**
```typescript
const settingsNav = [
  { href: '/settings/profile', icon: UserIcon, label: 'Profile' },
  { href: '/settings/account', icon: ShieldIcon, label: 'Account' },
  { href: '/settings/notifications', icon: BellIcon, label: 'Notifications' },
  { href: '/settings/billing', icon: CreditCardIcon, label: 'Billing' },
  { href: '/settings/team', icon: UsersIcon, label: 'Team' },
  { href: '/settings/integrations', icon: PlugIcon, label: 'Integrations' },
];

// Renders vertical nav with active state
```

**Desktop Layout:**
```
┌─────────────────────────────────────────┐
│ [App Header]                            │
├─────────────┬───────────────────────────┤
│             │                           │
│ Profile     │ Profile Settings          │
│ Account     │                           │
│ Notifications│ [Display Name]          │
│ Billing     │ [Bio]                    │
│ Team        │                           │
│ Integrations│ [Save Button]            │
│             │                           │
└─────────────┴───────────────────────────┘
```

**Mobile Layout:** Hamburger menu for sidebar, full-width content

#### 2.3 Profile Settings

**Features:**
- Display name (max 100 chars)
- Bio/About (max 500 chars with counter)
- Avatar upload (max 5MB, crop to square)
- Timezone selection (for appointment scheduling)
- Language preference (Romanian/English)

**Database Schema Addition:**
```typescript
// Add to users collection:
interface User {
  // ... existing fields ...
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  timezone: string;           // "Europe/Bucharest"
  language: 'ro' | 'en';
}
```

**API Endpoints:**
- `GET /api/settings/profile` - Fetch user profile
- `PATCH /api/settings/profile` - Update profile
- `POST /api/settings/profile/avatar` - Upload avatar

**Validation:**
```typescript
const profileSchema = z.object({
  display_name: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  timezone: z.string(),
  language: z.enum(['ro', 'en']),
});
```

#### 2.4 Account Settings

**Features:**
- Change email (requires verification)
- Change password (requires current password)
- Two-factor authentication (TOTP via Authenticator app)
- Connected accounts (Google OAuth, Facebook)
- Delete account (with confirmation + 30-day grace period)

**Database Schema:**
```typescript
interface User {
  // ... existing fields ...
  two_factor_enabled: boolean;
  two_factor_secret: string | null;
  backup_codes: string[];     // 10 one-time codes
  deleted_at: Date | null;    // Soft delete
}
```

**API Endpoints:**
- `POST /api/settings/account/email` - Request email change (sends verification)
- `POST /api/settings/account/password` - Change password
- `POST /api/settings/account/2fa/enable` - Enable 2FA
- `POST /api/settings/account/2fa/verify` - Verify 2FA code
- `POST /api/settings/account/2fa/disable` - Disable 2FA
- `DELETE /api/settings/account` - Soft delete account

**2FA Implementation:**
- Use `otplib` library for TOTP generation
- QR code generated with `qrcode` library
- Display QR + manual entry code
- Verify with 6-digit code
- Generate 10 backup codes

#### 2.5 Notification Settings

**Features:**
- Email notifications:
  - New appointment booked
  - Appointment reminder (24h before)
  - Appointment canceled
  - New message from client
  - Payment received
  - Weekly summary digest
- SMS notifications (requires Twilio):
  - Same options as email
  - Per-notification toggle

**Database Schema:**
```typescript
interface NotificationPreferences {
  user_id: ObjectId;
  email_enabled: boolean;
  email_appointment_booked: boolean;
  email_appointment_reminder: boolean;
  email_appointment_canceled: boolean;
  email_new_message: boolean;
  email_payment_received: boolean;
  email_weekly_digest: boolean;
  sms_enabled: boolean;
  sms_appointment_reminder: boolean;
  // ... same SMS options
}
```

**API Endpoint:**
- `GET /api/settings/notifications` - Fetch preferences
- `PATCH /api/settings/notifications` - Update preferences

**UI Pattern:** Grouped checkboxes with master toggle (Enable Email Notifications)

#### 2.6 Billing Settings (Future - Placeholder)

**Features:**
- Current plan display (Free, Pro, Enterprise)
- Usage metrics (appointments this month, storage used)
- Upgrade/downgrade buttons
- Payment method (Stripe integration)
- Invoice history (downloadable PDFs)
- Cancel subscription

**For MVP:** Show "Coming Soon" placeholder with email signup for beta

**Database Schema (Future):**
```typescript
interface Subscription {
  user_id: ObjectId;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'canceled' | 'past_due';
  stripe_customer_id: string;
  stripe_subscription_id: string;
  current_period_start: Date;
  current_period_end: Date;
}
```

#### 2.7 Team Settings

**Features:**
- List team members (providers + staff)
- Invite member by email (sends invite link)
- Assign roles:
  - **Owner:** Full access (only one)
  - **Admin:** All access except billing
  - **Staff:** Limited (can view calendar, manage appointments)
  - **Viewer:** Read-only access
- Remove member (with confirmation)
- Pending invites list (resend/cancel)

**Database Schema:**
```typescript
interface User {
  // ... existing fields ...
  role: 'owner' | 'admin' | 'staff' | 'viewer';
  invited_by: ObjectId | null;
}

interface TeamInvite {
  id: ObjectId;
  user_id: ObjectId;          // Inviter
  email: string;
  role: 'admin' | 'staff' | 'viewer';
  token: string;              // Secure random token
  expires_at: Date;           // 7 days
  accepted_at: Date | null;
  created_at: Date;
}
```

**API Endpoints:**
- `GET /api/settings/team` - List members + invites
- `POST /api/settings/team/invite` - Send invite
- `DELETE /api/settings/team/[userId]` - Remove member
- `POST /api/settings/team/accept/[token]` - Accept invite (public endpoint)

**Role-Based Access Control (RBAC):**
```typescript
// lib/permissions.ts
const permissions = {
  owner: ['*'],
  admin: ['calendar.*', 'clients.*', 'settings.*', '!settings.billing'],
  staff: ['calendar.read', 'calendar.write', 'clients.read'],
  viewer: ['calendar.read', 'clients.read'],
};

function hasPermission(user: User, action: string): boolean {
  // Check if user role allows action
}
```

#### 2.8 Integrations Settings

**Refactor Email Integration:** Extract from 600-line file

**New Structure:**
- `IntegrationsClient.tsx` - Grid of integration cards
- `EmailIntegrationCard.tsx` - Yahoo, Gmail, Outlook (refactored)
- `CalendarIntegrationCard.tsx` - Google Calendar two-way sync
- `SmsIntegrationCard.tsx` - Twilio for SMS reminders
- `WhatsAppIntegrationCard.tsx` - WhatsApp Business API
- `PaymentIntegrationCard.tsx` - Stripe for payments

**Each Card Pattern:**
```typescript
interface IntegrationCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onTest?: () => void;
  status?: 'active' | 'error' | 'disconnected';
}

function IntegrationCard({ name, description, icon, connected, ... }) {
  return (
    <div className={styles.integrationCard}>
      <div className={styles.iconAndInfo}>
        {icon}
        <div>
          <h3>{name}</h3>
          <p>{description}</p>
        </div>
      </div>
      <div className={styles.actions}>
        {connected ? (
          <>
            <StatusBadge status={status} />
            {onTest && <button onClick={onTest}>Test</button>}
            <button onClick={onDisconnect}>Disconnect</button>
          </>
        ) : (
          <button onClick={onConnect}>Connect</button>
        )}
      </div>
    </div>
  );
}
```

#### 2.9 Form State Management

**Problem:** Complex dirty state tracking across multiple fields

**Solution:** Form library + custom save bar

**Use `react-hook-form`:**
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

function ProfileSettingsClient() {
  const { register, handleSubmit, formState: { isDirty, errors } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { /* from API */ },
  });

  const onSubmit = async (data) => {
    await fetch('/api/settings/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('display_name')} />
      {errors.display_name && <span>{errors.display_name.message}</span>}

      <SaveBar visible={isDirty} onSave={handleSubmit(onSubmit)} />
    </form>
  );
}
```

**`components/SaveBar.tsx`**
```typescript
function SaveBar({ visible, onSave, onCancel }) {
  if (!visible) return null;

  return (
    <div className={styles.saveBar}>
      <div className={styles.saveBarContent}>
        <span>You have unsaved changes</span>
        <div>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onSave} className={styles.primary}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Sticky positioning:** Fixed at bottom of viewport, slides up when visible

#### 2.10 Validation Strategy

**Centralized Schemas:** `lib/validation/settings.ts`
```typescript
export const profileSchema = z.object({ /* ... */ });
export const accountSchema = z.object({ /* ... */ });
export const notificationPreferencesSchema = z.object({ /* ... */ });
export const teamInviteSchema = z.object({ /* ... */ });
```

**Server-Side Validation:** All PATCH endpoints validate with Zod

**Client-Side Validation:** react-hook-form with zodResolver

**Error Display:** Inline errors below fields, toast for API errors

#### 2.11 Timeline

**Estimated Time:** 8-10 days

**Breakdown:**
- Day 1: Settings layout + sidebar navigation
- Day 2: Profile settings (form + avatar upload)
- Day 3: Account settings (password, 2FA)
- Days 4-5: Notification preferences + Team settings
- Days 6-7: Refactor email integrations into cards
- Day 8: New integration cards (Calendar, SMS placeholders)
- Days 9-10: Form state management + SaveBar + testing

---

### Phase 3: CRM Enhancements

**Goal:** Add workflow automation and advanced analytics to compete with real CRM systems.

#### 3.1 Workflow Automation System

**Use Cases:**
1. Auto-tag VIP clients (total_spent > 5000 RON)
2. Auto-tag inactive clients (no appointment in 90 days)
3. Auto-create follow-up task (3 days after appointment)
4. Auto-send reminder email (1 day before appointment)

**Database Schema:**

**New Collection: `workflows`**
```typescript
interface Workflow {
  id: ObjectId;
  user_id: ObjectId;
  name: string;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  is_active: boolean;
  created_at: Date;
}

interface WorkflowTrigger {
  type: 'appointment_completed' | 'client_created' | 'appointment_scheduled' | 'time_based';
  config: Record<string, unknown>;
}

interface WorkflowCondition {
  field: string;              // "total_spent", "last_appointment_date"
  operator: '>' | '<' | '=' | 'contains' | 'is_null';
  value: string | number;
}

interface WorkflowAction {
  type: 'add_tag' | 'remove_tag' | 'create_task' | 'send_email';
  config: Record<string, unknown>;
}
```

**Example Workflows:**

**1. VIP Auto-Tagging:**
```json
{
  "name": "Auto-tag VIP clients",
  "trigger": { "type": "appointment_completed" },
  "conditions": [
    { "field": "total_spent", "operator": ">", "value": 5000 }
  ],
  "actions": [
    { "type": "add_tag", "config": { "tag": "VIP" } }
  ]
}
```

**2. Inactive Client Warning:**
```json
{
  "name": "Tag inactive clients",
  "trigger": { "type": "time_based", "config": { "schedule": "daily" } },
  "conditions": [
    { "field": "last_appointment_date", "operator": "<", "value": "90_days_ago" },
    { "field": "status", "operator": "=", "value": "active" }
  ],
  "actions": [
    { "type": "add_tag", "config": { "tag": "Inactive" } },
    { "type": "create_task", "config": {
      "title": "Re-engage client",
      "description": "Client hasn't booked in 90 days"
    }}
  ]
}
```

**Workflow Engine:** `lib/workflows/engine.ts`
```typescript
async function executeWorkflow(workflow: Workflow, context: WorkflowContext) {
  // 1. Evaluate conditions
  const conditionsMet = evaluateConditions(workflow.conditions, context);
  if (!conditionsMet) return;

  // 2. Execute actions
  for (const action of workflow.actions) {
    await executeAction(action, context);
  }

  // 3. Log execution
  await logWorkflowExecution(workflow.id, context);
}
```

**Workflow UI:** `app/settings/workflows/page.tsx`
- List workflows with toggle (active/inactive)
- Create workflow wizard (trigger → conditions → actions)
- Workflow execution log (last 100 runs)

#### 3.2 Lead Scoring

**Formula:**
```typescript
function calculateLeadScore(client: Client): number {
  let score = 0;

  // Engagement
  score += client.total_appointments * 10;
  score += client.total_spent / 100;
  score += client.tags.includes('VIP') ? 50 : 0;

  // Recency
  const daysSinceLastContact = daysBetween(new Date(), client.last_contact_date);
  if (daysSinceLastContact < 30) score += 20;
  else if (daysSinceLastContact < 90) score += 10;

  // Source
  if (client.source === 'referral') score += 30;

  return Math.min(score, 100);  // Cap at 100
}
```

**Display:**
- Show score (0-100) on client profile
- Color code: 0-30 (gray), 31-60 (yellow), 61-100 (green)
- Filter clients by score range in list view

**Update Strategy:** Recalculate on every appointment completion or client update

#### 3.3 Advanced Analytics Dashboard

**New Page:** `app/analytics/page.tsx`

**Metrics to Display:**

1. **Revenue Metrics:**
   - Total revenue (this month, last month, YTD)
   - Revenue trend chart (last 12 months)
   - Revenue by service breakdown
   - Average transaction value

2. **Client Metrics:**
   - Total clients (active/inactive/lead)
   - New clients this month
   - Client lifetime value (LTV) = total_spent / client
   - Churn rate = clients who left / total clients

3. **Appointment Metrics:**
   - Appointments booked (this month)
   - No-show rate (no-shows / total appointments)
   - Most popular services
   - Peak booking times (heatmap)

4. **Retention Metrics:**
   - Repeat client rate = clients with >1 appointment / total
   - Average time between visits
   - Client retention cohorts (month 1, month 3, month 6)

**Charting Library:** Chart.js or Recharts

**Example Revenue Trend Component:**
```typescript
import { Line } from 'react-chartjs-2';

function RevenueTrendChart({ data }) {
  return (
    <Line
      data={{
        labels: ['Jan', 'Feb', 'Mar', ...],
        datasets: [{
          label: 'Revenue',
          data: [1200, 1500, 1800, ...],
          borderColor: 'rgb(75, 192, 192)',
        }],
      }}
    />
  );
}
```

#### 3.4 Bulk Operations

**Use Case:** Select 50 inactive clients → add "Re-engage" tag → create tasks

**UI Changes:**

**`app/clients/ClientsPageClient.tsx`:**
- Add checkbox column to table
- Add "Select all" checkbox in header
- Show bulk action toolbar when >0 selected

**Bulk Action Toolbar:**
```typescript
function BulkActionBar({ selectedCount, onAction }) {
  return (
    <div className={styles.bulkActionBar}>
      <span>{selectedCount} selected</span>
      <div>
        <button onClick={() => onAction('add_tag')}>Add Tag</button>
        <button onClick={() => onAction('remove_tag')}>Remove Tag</button>
        <button onClick={() => onAction('change_status')}>Change Status</button>
        <button onClick={() => onAction('export')}>Export</button>
        <button onClick={() => onAction('delete')}>Delete</button>
      </div>
    </div>
  );
}
```

**API Endpoint:**
```typescript
// POST /api/clients/bulk
interface BulkOperationRequest {
  client_ids: number[];
  operation: 'add_tag' | 'remove_tag' | 'change_status' | 'delete';
  data: Record<string, unknown>;
}

// Example: Add "VIP" tag to 10 clients
{
  client_ids: [1, 2, 3, ...],
  operation: 'add_tag',
  data: { tag: 'VIP' }
}
```

**Implementation:**
```typescript
// Use MongoDB $in operator for bulk update
await db.collection('clients').updateMany(
  { id: { $in: client_ids }, user_id: userId },
  { $addToSet: { tags: data.tag } }
);
```

#### 3.5 Advanced Filtering

**Current:** Status, source, sort by dropdown

**New:** Tag-based filtering + custom field filters

**UI Pattern:** Filter builder (like Notion database filters)

**Filter Builder Component:**
```typescript
interface Filter {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
  value: string | number;
}

function FilterBuilder({ filters, onChange }) {
  return (
    <div>
      {filters.map((filter, i) => (
        <div key={i}>
          <select value={filter.field} onChange={...}>
            <option value="name">Name</option>
            <option value="total_spent">Total Spent</option>
            <option value="tags">Tags</option>
            <option value="status">Status</option>
          </select>
          <select value={filter.operator} onChange={...}>
            <option value="equals">is</option>
            <option value="contains">contains</option>
            <option value="greater_than">greater than</option>
          </select>
          <input value={filter.value} onChange={...} />
          <button onClick={() => removeFilter(i)}>×</button>
        </div>
      ))}
      <button onClick={addFilter}>+ Add Filter</button>
    </div>
  );
}
```

**API Changes:**
```typescript
// GET /api/clients?filters=[...]&logic=AND

// Example: Total spent > 1000 AND tags contains "VIP"
filters = [
  { field: "total_spent", operator: "greater_than", value: 1000 },
  { field: "tags", operator: "contains", value: "VIP" }
]
```

#### 3.6 Client Profile Tabs Extraction

**Problem:** ClientProfileClient.tsx is 850 lines with 5 tabs in one file

**Solution:** Extract each tab into separate component

**New Structure:**
```
app/clients/[id]/
├── ClientProfileClient.tsx       (Orchestrator - 150 lines)
├── tabs/
│   ├── OverviewTab.tsx           (Stats + contact info - 150 lines)
│   ├── ActivitiesTab.tsx         (Timeline - 200 lines)
│   ├── AppointmentsTab.tsx       (Appointment history - 150 lines)
│   ├── ConversationsTab.tsx      (Email threads - 100 lines)
│   ├── TasksTab.tsx              (Related tasks - 100 lines)
│   └── FilesTab.tsx              (Documents - 100 lines)
└── components/
    ├── ClientHeader.tsx          (Name, email, phone, actions)
    ├── ClientStats.tsx           (Total spent, LTV, score)
    └── AddNoteModal.tsx          (Quick note form)
```

**Benefits:**
- Each tab <200 lines (maintainable)
- Lazy load tabs (only render active tab)
- Easier to add new tabs in future

#### 3.7 Integration Hooks for Extensibility

**Goal:** Make CRM extensible for future integrations (Zapier, custom webhooks)

**Webhook System:**

**New Collection: `webhooks`**
```typescript
interface Webhook {
  id: ObjectId;
  user_id: ObjectId;
  name: string;
  url: string;
  events: string[];          // ["client.created", "appointment.completed"]
  is_active: boolean;
  secret: string;            // For signature verification
  created_at: Date;
}
```

**Webhook Events:**
- `client.created`
- `client.updated`
- `appointment.scheduled`
- `appointment.completed`
- `appointment.canceled`
- `payment.received`

**Webhook Delivery:**
```typescript
// lib/webhooks.ts
async function sendWebhook(event: string, payload: unknown) {
  const webhooks = await getWebhooksForEvent(event);

  for (const webhook of webhooks) {
    const signature = generateSignature(payload, webhook.secret);

    await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
      },
      body: JSON.stringify({ event, payload }),
    });
  }
}
```

**UI:** `app/settings/webhooks/page.tsx`
- List webhooks
- Create webhook (URL, events, secret)
- Test webhook (send sample payload)
- Webhook delivery log (last 100 deliveries)

#### 3.8 Timeline

**Estimated Time:** 8-10 days

**Breakdown:**
- Days 1-2: Workflow automation system (engine + UI)
- Day 3: Lead scoring algorithm + display
- Days 4-5: Advanced analytics dashboard (charts + metrics)
- Day 6: Bulk operations (UI + API)
- Day 7: Advanced filtering (filter builder)
- Day 8: Extract client profile tabs
- Days 9-10: Webhook system + testing

---

## Phase 4: Cross-Feature Improvements

### 4.1 Caching Strategy (Redis)

**Why:** MongoDB queries for analytics, client lists, appointment slots are expensive

**Implementation:**

**Install Redis Client:**
```bash
npm install ioredis
```

**Redis Client:** `lib/redis.ts`
```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function getCached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const data = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}

export async function invalidateCache(pattern: string) {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) await redis.del(...keys);
}
```

**Apply Caching:**

1. **Client List:**
```typescript
// In GET /api/clients
const cacheKey = `clients:${userId}:${search}:${statusFilter}:page${page}`;
const clients = await getCached(cacheKey, 300, () => getClientsFromDB(...));

// Invalidate on create/update
await invalidateCache(`clients:${userId}:*`);
```

2. **Appointment Slots:**
```typescript
// In GET /api/calendar/slots
const cacheKey = `slots:${userId}:${providerId}:${date}`;
const slots = await getCached(cacheKey, 600, () => calculateSlots(...));

// Invalidate when appointment created/updated
await invalidateCache(`slots:${userId}:*`);
```

3. **Analytics:**
```typescript
// In GET /api/analytics/revenue
const cacheKey = `analytics:revenue:${userId}:${month}`;
const revenue = await getCached(cacheKey, 3600, () => calculateRevenue(...));

// Invalidate daily via cron
```

**Cache TTL Guidelines:**
- Client list: 5 minutes (300s)
- Appointment slots: 10 minutes (600s)
- Analytics: 1 hour (3600s)
- Client profile: 2 minutes (120s)

### 4.2 Performance Optimizations

**1. Add MongoDB Indexes:**
```javascript
// scripts/create-indexes.js
await db.collection('clients').createIndex({ user_id: 1, status: 1 });
await db.collection('clients').createIndex({ user_id: 1, total_spent: -1 });
await db.collection('clients').createIndex({ user_id: 1, last_appointment_date: -1 });
await db.collection('appointments').createIndex({ user_id: 1, start_time: 1 });
await db.collection('appointments').createIndex({ user_id: 1, provider_id: 1, start_time: 1 });
await db.collection('conversations').createIndex({ user_id: 1, updated_at: -1 });
```

**2. Optimize Large Components:**
```typescript
// Use React.memo for expensive renders
export default React.memo(AppointmentBlock, (prev, next) => {
  return prev.appointment.id === next.appointment.id &&
         prev.appointment.status === next.appointment.status;
});

// Use useMemo for expensive calculations
const sortedClients = useMemo(
  () => clients.sort((a, b) => b.total_spent - a.total_spent),
  [clients]
);
```

**3. Code Splitting:**
```typescript
// Lazy load heavy modals
const CreateAppointmentModal = lazy(() => import('./modals/CreateAppointmentModal'));

// Use Suspense
<Suspense fallback={<LoadingSpinner />}>
  {showModal && <CreateAppointmentModal />}
</Suspense>
```

### 4.3 Security Hardening

**1. Rate Limiting:**
```typescript
// lib/rate-limit.ts
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // Max 100 requests per 15min
  message: 'Too many requests',
});

// Apply to API routes
export async function GET(request: Request) {
  await apiLimiter(request);
  // ... handler logic
}
```

**2. CSRF Protection:**
```typescript
// Already uses SameSite cookies in NextAuth
// Add CSRF token to forms
import { getCsrfToken } from 'next-auth/react';

const csrfToken = await getCsrfToken();
<input type="hidden" name="csrfToken" value={csrfToken} />
```

**3. Audit Logging:**
```typescript
// New Collection: audit_logs
interface AuditLog {
  user_id: ObjectId;
  action: string;            // "client.created", "appointment.deleted"
  resource_type: string;     // "client", "appointment"
  resource_id: ObjectId;
  changes: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: Date;
}

// Log all write operations
await logAudit({
  user_id,
  action: 'client.updated',
  resource_type: 'client',
  resource_id: clientId,
  changes: { status: 'active' → 'inactive' },
});
```

### 4.4 API Design Consistency

**Standardize Response Format:**
```typescript
// lib/api-response.ts
export function successResponse<T>(data: T, meta?: Record<string, unknown>) {
  return Response.json({ success: true, data, meta });
}

export function errorResponse(message: string, code: number = 400) {
  return Response.json({ success: false, error: message }, { status: code });
}

// Use everywhere:
return successResponse({ clients, pagination });
return errorResponse('Client not found', 404);
```

**Standardize Error Codes:**
- 400: Bad Request (validation error)
- 401: Unauthorized (not logged in)
- 403: Forbidden (no permission)
- 404: Not Found
- 409: Conflict (appointment overlap)
- 429: Too Many Requests (rate limit)
- 500: Internal Server Error

### 4.5 Testing Infrastructure

**Unit Tests:** Jest + React Testing Library
```typescript
// tests/lib/calendar.test.ts
describe('checkAppointmentConflict', () => {
  it('detects provider conflict', async () => {
    const result = await checkAppointmentConflict(...);
    expect(result.hasConflict).toBe(true);
  });
});
```

**Integration Tests:** Test API endpoints
```typescript
// tests/api/appointments.test.ts
describe('POST /api/appointments', () => {
  it('creates appointment with valid data', async () => {
    const response = await fetch('/api/appointments', { method: 'POST', ... });
    expect(response.status).toBe(201);
  });
});
```

**E2E Tests:** Playwright (optional for MVP)
```typescript
test('create recurring appointment', async ({ page }) => {
  await page.goto('/calendar');
  await page.click('[data-testid="create-appointment"]');
  await page.check('[data-testid="recurring-checkbox"]');
  // ...
});
```

---

## Verification & Testing Plan

### Phase 0 (Auth) Verification
- ✅ Register new user → verify user created in DB
- ✅ Login → verify session created
- ✅ Access protected route without auth → verify redirect to login
- ✅ Create client as User A → verify User B can't see it (isolation test)
- ✅ Logout → verify session cleared

### Phase 1 (Calendar) Verification
- ✅ Create appointment → verify no conflicts
- ✅ Create conflicting appointment → verify error shown
- ✅ Drag appointment to new time → verify update successful
- ✅ Create recurring weekly for 8 weeks → verify 8 instances created
- ✅ Edit "all future" recurring → verify correct instances updated
- ✅ Add to waitlist → cancel appointment → verify waitlist notified

### Phase 2 (Settings) Verification
- ✅ Update profile → verify saved and displayed
- ✅ Enable 2FA → verify QR code shown and verification works
- ✅ Change email → verify verification email sent
- ✅ Invite team member → verify invite email sent and acceptance works
- ✅ Connect Yahoo Mail → verify test connection succeeds
- ✅ Form dirty state → navigate away → verify unsaved warning

### Phase 3 (CRM) Verification
- ✅ Create workflow (VIP auto-tag) → complete appointment > 5000 RON → verify VIP tag added
- ✅ Bulk select 10 clients → add tag → verify all tagged
- ✅ View analytics dashboard → verify revenue chart shows last 12 months
- ✅ Filter clients by total_spent > 1000 AND tag "VIP" → verify correct results
- ✅ Create webhook → trigger event → verify webhook received payload

### Performance Testing
- ✅ Load calendar with 1000 appointments → verify renders in <2s
- ✅ Search clients with 10k records → verify results in <500ms
- ✅ Concurrent appointment creation (10 users) → verify no race conditions

---

## Build Order & Dependencies

```
Phase 0: Authentication (5-7 days) ← START HERE
  ├─ No blockers, can start immediately
  └─ BLOCKS: All other phases (everything needs auth)

Phase 1: Calendar Redesign (10-12 days)
  ├─ DEPENDS ON: Phase 0 (auth system)
  └─ CAN START AFTER: Phase 0 complete

Phase 2: Settings Redesign (8-10 days)
  ├─ DEPENDS ON: Phase 0 (auth system)
  └─ CAN START AFTER: Phase 0 complete
  └─ OR: Start in parallel with Phase 1 (different files)

Phase 3: CRM Enhancements (8-10 days)
  ├─ DEPENDS ON: Phase 0 (auth system)
  └─ CAN START AFTER: Phase 0 complete
  └─ OR: Start in parallel with Phase 1/2

Phase 4: Cross-Feature (5-7 days)
  ├─ DEPENDS ON: Phases 1, 2, 3 (needs code to optimize)
  └─ CAN START AFTER: Any phase complete (incremental)
```

**Total Timeline:** 36-46 days (5-6 weeks)

**Parallelization Strategy:**
- Week 1: Phase 0 only (foundation)
- Weeks 2-4: Phases 1, 2, 3 in parallel (independent work)
- Weeks 5-6: Phase 4 + polish + testing

---

## Trade-offs & Architectural Decisions

### Decision 1: NextAuth.js vs Clerk vs Custom

**Chosen:** NextAuth.js

**Rationale:**
- Free and open-source (Clerk costs $25/mo after 10k MAU)
- Works with existing MongoDB (Clerk prefers PostgreSQL)
- Flexible (supports any OAuth provider)
- Well-documented and battle-tested

**Trade-off:** More setup time than Clerk (3 days vs 1 day)

### Decision 2: Custom Hooks vs Redux/Zustand

**Chosen:** Custom hooks

**Rationale:**
- State is page-scoped (calendar state only used on calendar page)
- No need for global store
- Simpler mental model
- Less boilerplate

**Trade-off:** Harder to share state between distant components (but we don't need to)

### Decision 3: react-hook-form vs Formik

**Chosen:** react-hook-form

**Rationale:**
- Better performance (uncontrolled inputs)
- Smaller bundle size (9KB vs 18KB)
- Built-in Zod integration
- Modern API (hooks-based)

**Trade-off:** Less familiar to developers who know Formik

### Decision 4: MongoDB Indexes vs Full-Text Search

**Chosen:** MongoDB indexes with regex search

**Rationale:**
- Faster for exact/prefix matches
- No external dependency (Elasticsearch/Algolia)
- Sufficient for <100k clients

**Trade-off:** Poor performance for fuzzy search (but not needed in MVP)

**Future:** Add Elasticsearch when >100k records

### Decision 5: CSS Modules vs Tailwind

**Chosen:** CSS Modules (keep existing)

**Rationale:**
- Already used throughout codebase
- Design system with CSS variables already defined
- No need to refactor styling

**Trade-off:** More verbose than Tailwind utility classes

### Decision 6: Polling vs WebSockets for Real-Time

**Chosen:** Polling (not implemented in this plan, but if needed)

**Rationale:**
- Simpler to implement
- Works with serverless (Vercel)
- Sufficient for low-frequency updates

**Trade-off:** Higher latency (5-10s) vs WebSockets (<1s)

**When to Switch:** If >1000 concurrent users or <1s latency required

---

## File Structure Summary

**New Directories:**
```
lib/
├── auth.ts                          (Auth helper)
├── redis.ts                         (Redis caching)
├── workflows/
│   ├── engine.ts                    (Workflow execution)
│   ├── conditions.ts                (Condition evaluation)
│   └── actions.ts                   (Action execution)
├── webhooks.ts                      (Webhook delivery)
└── validation/
    └── settings.ts                  (Settings schemas)

app/
├── login/page.tsx                   (Login UI)
├── register/page.tsx                (Register UI)
├── calendar/
│   ├── components/                  (Extracted components)
│   └── hooks/                       (Custom hooks)
├── settings/
│   ├── layout.tsx                   (Settings shell)
│   ├── profile/
│   ├── account/
│   ├── notifications/
│   ├── billing/
│   ├── team/
│   └── integrations/
├── analytics/page.tsx               (Analytics dashboard)
└── api/
    ├── auth/[...nextauth]/route.ts  (NextAuth config)
    ├── providers/route.ts           (Provider CRUD)
    ├── resources/route.ts           (Resource CRUD)
    ├── blocked-times/route.ts       (Blocked time CRUD)
    ├── appointments/recurring/route.ts
    ├── waitlist/route.ts
    ├── workflows/route.ts
    ├── webhooks/route.ts
    └── clients/bulk/route.ts

scripts/
├── add-user-id-to-collections.js    (Migration script)
├── create-demo-user.js              (Seed script)
└── create-indexes.js                (Index creation)
```

**Files to Refactor:**
```
d:\m-saas\app\calendar\CalendarPageClient.tsx    (1,030 → 200 lines)
d:\m-saas\app\settings\email\EmailSettingsPageClient.tsx    (600 → 150 lines)
d:\m-saas\app\clients\[id]\ClientProfileClient.tsx    (850 → 150 lines)
```

---

## Success Metrics

**Phase 0 (Auth):**
- ✅ All API routes protected (0 hardcoded userIds)
- ✅ Multi-user isolation works (users can't see each other's data)
- ✅ Session persistence works (login stays across page refresh)

**Phase 1 (Calendar):**
- ✅ Zero double-bookings (conflict detection 100% accurate)
- ✅ Recurring appointments work (8/8 instances created successfully)
- ✅ Drag-and-drop reschedule <1s latency

**Phase 2 (Settings):**
- ✅ All 6 sections implemented (profile, account, notifications, billing, team, integrations)
- ✅ Form validation catches errors (0 invalid submissions reach server)
- ✅ SaveBar UX works (shows on dirty, hides on save)

**Phase 3 (CRM):**
- ✅ Workflows execute correctly (VIP auto-tag triggers when expected)
- ✅ Analytics dashboard loads in <2s
- ✅ Bulk operations handle 100+ clients without timeout

**Phase 4 (Performance):**
- ✅ Client list cached (300ms → 50ms on repeat view)
- ✅ Calendar with 1000 appointments renders <2s
- ✅ All MongoDB queries use indexes (0 collection scans)

---

## Critical Files Reference

**Most Important Files to Modify:**

1. `d:\m-saas\app\calendar\CalendarPageClient.tsx` (1,030 lines → refactor)
2. `d:\m-saas\app\settings\email\EmailSettingsPageClient.tsx` (600 lines → refactor)
3. `d:\m-saas\app\clients\[id]\ClientProfileClient.tsx` (850 lines → extract tabs)
4. `d:\m-saas\lib\calendar.ts` (add conflict detection, recurrence logic)
5. `d:\m-saas\app\api\appointments\route.ts` (add provider/resource support)
6. `d:\m-saas\app\api\clients\route.ts` (add auth, bulk operations)

**New Files to Create:**

1. `lib/auth.ts` - Auth helper (CRITICAL - use everywhere)
2. `app/api/auth/[...nextauth]/route.ts` - NextAuth config
3. `app/settings/layout.tsx` - Settings shell
4. `lib/workflows/engine.ts` - Workflow automation
5. `lib/redis.ts` - Caching layer
6. `app/analytics/page.tsx` - Analytics dashboard

---

## Next Steps After Plan Approval

1. **Review this plan** with stakeholders for feedback
2. **Set up development environment** (MongoDB, Redis, test accounts)
3. **Create feature branch** for Phase 0
4. **Start Phase 0: Authentication** (5-7 days)
5. **Daily standups** to track progress and blockers
6. **Weekly demos** to show progress and get feedback

---

**This plan transforms m-saas from a 75% complete prototype into a production-ready MVP SaaS application with real-world features inspired by Calendly, Stripe, and Pipedrive.**
