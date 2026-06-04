import { cache } from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

export class AuthError extends Error {
  public status: number;
  public code?: string;

  constructor(message: string, status: number = 401, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

/** Call from server page catch blocks instead of bare redirect('/login'). */
export function redirectToLogin(err?: unknown): never {
  if (err instanceof AuthError) {
    if (err.code === 'SUPER_ADMIN_REDIRECT') {
      redirect('/admin');
    }
    if (err.code === 'SESSION_EXPIRED') {
      redirect('/login?forced=1');
    }
  }
  redirect('/login');
}

export type UserRole = 'super_admin' | 'owner' | 'dentist' | 'receptionist' | 'asistent';

// Roles allowed to manage clinical infrastructure (delete patients,
// configure clinic-wide email integrations, etc). Receptionists and
// asistents can read and edit, but not perform destructive or
// configuration-level actions.
export function isClinicalRole(role: UserRole | string | null | undefined): boolean {
  return role === 'owner' || role === 'dentist' || role === 'super_admin';
}

export interface AuthContext {
  userId: number;
  userIdRaw: string;
  dbUserId: ObjectId;
  tenantId: ObjectId;
  email: string;
  name: string;
  role: UserRole;
  assigned_dentist_user_ids?: number[];
  userStatus: string;
  tenantStatus: string;
  membershipStatus: string;
}

function parseSessionVersion(rawValue: unknown): number {
  const parsed =
    typeof rawValue === 'number'
      ? rawValue
      : typeof rawValue === 'string'
        ? Number.parseInt(rawValue, 10)
        : 0;
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new AuthError('Invalid session version', 401);
  }
  return Math.trunc(parsed);
}

export const getAuthUser = cache(async function getAuthUser(): Promise<AuthContext> {
  const session = await auth();
  const userIdRaw = session?.user?.id?.trim();
  const dbUserIdRaw = session?.user?.dbUserId;
  if (!userIdRaw || !dbUserIdRaw) {
    throw new AuthError('Not authenticated', 401);
  }

  // Super-admins must use the platform admin dashboard; they are not tenant
  // members and have no place inside tenant-scoped surfaces.
  if (session.user.role === 'super_admin') {
    throw new AuthError('Super-admins must use the admin dashboard', 403, 'SUPER_ADMIN_REDIRECT');
  }

  if (!session.user.tenantId) {
    throw new AuthError('No tenant associated with this account', 403);
  }

  if (!/^[1-9]\d*$/.test(userIdRaw)) {
    throw new AuthError('Invalid user identifier format in session', 401);
  }
  const userId = Number.parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId) || userId <= 0 || String(userId) !== userIdRaw) {
    throw new AuthError('Invalid user identifier in session', 401);
  }
  if (!ObjectId.isValid(dbUserIdRaw)) {
    throw new AuthError('Invalid database user identifier in session', 401);
  }
  if (!ObjectId.isValid(session.user.tenantId)) {
    throw new AuthError('Invalid tenant identifier in session', 401);
  }

  const sessionVersion = parseSessionVersion(session.user.sessionVersion);
  const db = await getMongoDbOrThrow();
  const dbUserId = new ObjectId(dbUserIdRaw);
  const tenantId = new ObjectId(session.user.tenantId);

  // Single aggregation replaces 3 parallel findOne calls (1 round trip vs 3).
  const [authDoc] = await db.collection('users').aggregate<{
    _id: ObjectId;
    id?: number;
    role?: string;
    name?: string;
    email?: string;
    status?: string;
    session_version?: number;
    tenant?: Array<{ status?: string }>;
    membership?: Array<{ status?: string; assigned_dentist_user_ids?: unknown[] }>;
  }>([
    { $match: { _id: dbUserId, tenant_id: tenantId } },
    {
      $lookup: {
        from: 'tenants',
        let: { tid: '$tenant_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$_id', '$$tid'] } } },
          { $project: { status: 1 } },
          { $limit: 1 },
        ],
        as: 'tenant',
      },
    },
    {
      $lookup: {
        from: 'team_members',
        let: { uid: '$_id', tid: '$tenant_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$user_id', '$$uid'] },
                  { $eq: ['$tenant_id', '$$tid'] },
                ],
              },
            },
          },
          { $project: { status: 1, assigned_dentist_user_ids: 1 } },
          { $limit: 1 },
        ],
        as: 'membership',
      },
    },
    { $limit: 1 },
  ]).toArray();

  if (!authDoc) {
    throw new AuthError('User account not found', 401);
  }
  const dbUser = authDoc;
  const tenant = authDoc.tenant?.[0];
  const membership = authDoc.membership?.[0];

  const dbSessionVersion = parseSessionVersion(dbUser.session_version ?? 0);
  if (dbSessionVersion !== sessionVersion) {
    throw new AuthError('Session expired. Please sign in again.', 401, 'SESSION_EXPIRED');
  }

  if (dbUser.status !== 'active') {
    throw new AuthError('User account is not active', 403);
  }
  if (!tenant || tenant.status !== 'active') {
    throw new AuthError('Tenant is not active', 403);
  }
  if (!membership || membership.status !== 'active') {
    throw new AuthError('Membership is not active', 403);
  }

  if (typeof dbUser.id === 'number' && Number.isFinite(dbUser.id)) {
    if (Math.trunc(dbUser.id) !== userId) {
      throw new AuthError('Session user identifier mismatch', 401);
    }
  }

  const rawRole = String(dbUser.role || session.user.role || 'dentist');
  const resolvedRole = (rawRole === 'staff' ? 'dentist' : rawRole) as UserRole;
  const assigned_dentist_user_ids =
    resolvedRole === 'asistent' && Array.isArray(membership.assigned_dentist_user_ids)
      ? membership.assigned_dentist_user_ids.filter((id: unknown): id is number => (
          typeof id === 'number' && Number.isInteger(id) && id > 0
        ))
      : undefined;

  return {
    userId,
    userIdRaw,
    dbUserId,
    tenantId,
    email: dbUser.email || session.user.email || '',
    name: dbUser.name || session.user.name || '',
    role: resolvedRole,
    assigned_dentist_user_ids,
    userStatus: String(dbUser.status || 'active'),
    tenantStatus: String(tenant.status || 'active'),
    membershipStatus: String(membership.status || 'active'),
  };
});

export async function getSuperAdmin(): Promise<{ userId: ObjectId; userIdRaw: string; email: string }> {
  const session = await auth();
  const userIdRaw = session?.user?.dbUserId;
  if (!userIdRaw) {
    throw new AuthError('Not authenticated', 401);
  }
  if (session.user.role !== 'super_admin') {
    throw new AuthError('Super-admin access required', 403);
  }
  if (!ObjectId.isValid(userIdRaw)) {
    throw new AuthError('Invalid super-admin identifier', 401);
  }
  const sessionVersion = parseSessionVersion(session.user.sessionVersion);
  const db = await getMongoDbOrThrow();
  const userId = new ObjectId(userIdRaw);
  const superAdmin = await db.collection('users').findOne({ _id: userId, role: 'super_admin' });
  if (!superAdmin) {
    throw new AuthError('Super-admin account not found', 403);
  }
  const dbSessionVersion = parseSessionVersion(superAdmin.session_version ?? 0);
  if (dbSessionVersion !== sessionVersion) {
    throw new AuthError('Session expired. Please sign in again.', 401);
  }
  if (superAdmin.status !== 'active') {
    throw new AuthError('Super-admin account is not active', 403);
  }
  return {
    userId,
    userIdRaw,
    email: superAdmin.email || session.user.email || '',
  };
}
