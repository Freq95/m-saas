import { ObjectId } from 'mongodb';
import type { AuthContext } from '@/lib/auth-helpers';
import { AuthError } from '@/lib/auth-helpers';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

export function canCrudCategoriesFor(auth: AuthContext, targetUserId: number): boolean {
  if (auth.userId === targetUserId) return true;
  if (auth.role === 'asistent' && auth.assigned_dentist_user_ids?.includes(targetUserId)) return true;
  return false;
}

export function canReadCategoriesFor(
  auth: AuthContext,
  targetUserId: number,
  targetTenantId: ObjectId
): boolean {
  if (auth.userId === targetUserId) return true;
  if (targetTenantId.toString() !== auth.tenantId.toString()) return false;
  if (auth.role === 'owner' || auth.role === 'receptionist') return true;
  if (auth.role === 'asistent') return auth.assigned_dentist_user_ids?.includes(targetUserId) ?? false;
  return false;
}

export async function assertTenantDentistForCategories(
  auth: AuthContext,
  targetUserId: number
): Promise<{ userId: number; tenantId: ObjectId; name: string }> {
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

  return {
    userId: targetUserId,
    tenantId: auth.tenantId,
    name: dentist.name || dentist.email || `Medic ${targetUserId}`,
  };
}

export async function resolveCategoryWriteScope(
  auth: AuthContext,
  targetUserId: number
): Promise<{ userId: number; tenantId: ObjectId }> {
  if (!canCrudCategoriesFor(auth, targetUserId)) {
    throw new AuthError('Not authorized to manage categories for this dentist', 403);
  }

  if (auth.userId === targetUserId) {
    return { userId: targetUserId, tenantId: auth.tenantId };
  }

  await assertTenantDentistForCategories(auth, targetUserId);
  return { userId: targetUserId, tenantId: auth.tenantId };
}
