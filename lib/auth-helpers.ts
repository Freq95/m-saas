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
  if (err instanceof AuthError && err.code === 'SESSION_EXPIRED') {
    redirect('/login?forced=1');
  }
  redirect('/login');
}

// MVP roles: super_admin (platform), owner (clinic), staff (clinic).
// 'admin' removed (merged into owner). 'viewer' reserved but not implemented.
export type UserRole = 'super_admin' | 'owner' | 'staff';

export interface AuthContext {
  userId: number;
  userIdRaw: string;
  dbUserId: ObjectId;
  tenantId: ObjectId;
  email: string;
  name: string;
  role: UserRole;
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

export async function getAuthUser(): Promise<AuthContext> {
  const session = await auth();
  const userIdRaw = session?.user?.id?.trim();
  const dbUserIdRaw = session?.user?.dbUserId;
  if (!userIdRaw || !dbUserIdRaw) {
    throw new AuthError('Not authenticated', 401);
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

  const [dbUser, tenant, membership] = await Promise.all([
    db.collection('users').findOne({ _id: dbUserId, tenant_id: tenantId }),
    db.collection('tenants').findOne({ _id: tenantId }),
    db.collection('team_members').findOne({ user_id: dbUserId, tenant_id: tenantId }),
  ]);

  if (!dbUser) {
    throw new AuthError('User account not found', 401);
  }

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

  return {
    userId,
    userIdRaw,
    dbUserId,
    tenantId,
    email: dbUser.email || session.user.email || '',
    name: dbUser.name || session.user.name || '',
    role: (dbUser.role || session.user.role || 'staff') as UserRole,
    userStatus: String(dbUser.status || 'active'),
    tenantStatus: String(tenant.status || 'active'),
    membershipStatus: String(membership.status || 'active'),
  };
}

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
