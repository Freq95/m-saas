import { auth } from '@/lib/auth';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

export class AuthError extends Error {
  public status: number;

  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
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

const ROLE_HIERARCHY: UserRole[] = ['staff', 'owner', 'super_admin'];

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

  const db = await getMongoDbOrThrow();
  const dbUserId = new ObjectId(dbUserIdRaw);
  const tenantId = new ObjectId(session.user.tenantId);

  const [user, tenant, membership] = await Promise.all([
    db.collection('users').findOne({ _id: dbUserId, id: userId, tenant_id: tenantId }),
    db.collection('tenants').findOne({ _id: tenantId }),
    db.collection('team_members').findOne({ user_id: dbUserId, tenant_id: tenantId }),
  ]);

  if (!user) {
    throw new AuthError('User no longer exists for this session', 401);
  }
  if (user.status !== 'active') {
    throw new AuthError('User account is not active', 403);
  }
  if (!tenant) {
    throw new AuthError('Tenant no longer exists', 403);
  }
  if (tenant.status !== 'active') {
    throw new AuthError(`Tenant is ${tenant.status}`, 403);
  }
  if (!membership) {
    throw new AuthError('No team membership found for this tenant', 403);
  }
  if (membership.status !== 'active') {
    throw new AuthError(`Team membership is ${membership.status}`, 403);
  }

  return {
    userId,
    userIdRaw,
    dbUserId,
    tenantId,
    email: user.email || session.user.email || '',
    name: user.name || session.user.name || '',
    role: (user.role || session.user.role || 'staff') as UserRole,
    userStatus: user.status || 'unknown',
    tenantStatus: tenant.status || 'unknown',
    membershipStatus: membership.status || 'unknown',
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
  const db = await getMongoDbOrThrow();
  const userId = new ObjectId(userIdRaw);
  const superAdmin = await db.collection('users').findOne({ _id: userId, role: 'super_admin' });
  if (!superAdmin) {
    throw new AuthError('Super-admin account not found', 403);
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

export function requireRole(userRole: UserRole, minimumRole: UserRole) {
  if (ROLE_HIERARCHY.indexOf(userRole) < ROLE_HIERARCHY.indexOf(minimumRole)) {
    throw new AuthError(`Requires at least ${minimumRole} role`, 403);
  }
}
