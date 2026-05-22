import { ObjectId } from 'mongodb';
import type { AuthContext } from '@/lib/auth-helpers';
import { AuthError } from '@/lib/auth-helpers';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

export function canCrudServicesFor(auth: AuthContext, targetUserId: number): boolean {
  if (auth.userId === targetUserId) return true;
  if (auth.role === 'owner') return true;
  if (auth.role === 'asistent' && auth.assigned_dentist_user_ids?.includes(targetUserId)) return true;
  return false;
}

export function canReadServicesFor(auth: AuthContext, targetUserId: number): boolean {
  if (auth.userId === targetUserId) return true;
  if (auth.role === 'owner' || auth.role === 'receptionist') return true;
  if (auth.role === 'asistent' && auth.assigned_dentist_user_ids?.includes(targetUserId)) return true;
  return false;
}

export async function assertTenantDentist(auth: AuthContext, targetUserId: number): Promise<void> {
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw new AuthError('Invalid dentist user id', 400);
  }

  const db = await getMongoDbOrThrow();
  const dentist = await db.collection('users').findOne({
    id: targetUserId,
    tenant_id: auth.tenantId,
    role: { $in: ['owner', 'dentist'] },
    status: { $ne: 'deleted' },
  });

  if (!dentist) {
    throw new AuthError('Dentist not found in this tenant', 404);
  }
}

export async function resolveServiceWriteScope(
  auth: AuthContext,
  targetUserId: number
): Promise<{ userId: number; tenantId: ObjectId }> {
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    throw new AuthError('Invalid dentist user id', 400);
  }

  if (!canCrudServicesFor(auth, targetUserId)) {
    throw new AuthError('Not authorized to manage services for this dentist', 403);
  }

  if (auth.userId === targetUserId) {
    return {
      userId: targetUserId,
      tenantId: auth.tenantId,
    };
  }

  await assertTenantDentist(auth, targetUserId);

  return {
    userId: targetUserId,
    tenantId: auth.tenantId,
  };
}
