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

export type UserRole = 'super_admin' | 'owner' | 'admin' | 'staff' | 'viewer';

export interface AuthContext {
  userId: number;
  userIdRaw: string;
  tenantId: ObjectId;
  email: string;
  name: string;
  role: UserRole;
}

const ROLE_HIERARCHY: UserRole[] = ['viewer', 'staff', 'admin', 'owner', 'super_admin'];

export async function getAuthUser(): Promise<AuthContext> {
  const session = await auth();
  const userIdRaw = session?.user?.id;
  if (!userIdRaw) {
    throw new AuthError('Not authenticated', 401);
  }

  if (!session.user.tenantId) {
    throw new AuthError('No tenant associated with this account', 403);
  }

  const userId = Number.parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new AuthError('Invalid user identifier in session', 401);
  }

  return {
    userId,
    userIdRaw,
    tenantId: new ObjectId(session.user.tenantId),
    email: session.user.email || '',
    name: session.user.name || '',
    role: (session.user.role || 'viewer') as UserRole,
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
  return {
    userId: new ObjectId(userIdRaw),
    userIdRaw,
    email: session.user.email || '',
  };
}

export function requireRole(userRole: UserRole, minimumRole: UserRole) {
  if (ROLE_HIERARCHY.indexOf(userRole) < ROLE_HIERARCHY.indexOf(minimumRole)) {
    throw new AuthError(`Requires at least ${minimumRole} role`, 403);
  }
}
