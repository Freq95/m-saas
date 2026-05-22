import { ObjectId } from 'mongodb';
import type { AuthContext } from '@/lib/auth-helpers';
import { AuthError } from '@/lib/auth-helpers';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

export type ClientScope = {
  userId: number;
  tenantId: ObjectId;
};

export function canAccessClientsFor(auth: AuthContext, targetUserId: number): boolean {
  if (auth.userId === targetUserId) return true;
  if (auth.role === 'owner') return true;
  if (auth.role === 'asistent' && auth.assigned_dentist_user_ids?.includes(targetUserId)) return true;
  return false;
}

export async function assertTenantClientDentist(auth: AuthContext, targetUserId: number): Promise<void> {
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

export async function resolveClientScopeForDentist(auth: AuthContext, targetUserId: number): Promise<ClientScope> {
  if (!canAccessClientsFor(auth, targetUserId)) {
    throw new AuthError('Not authorized to access clients for this dentist', 403);
  }
  if (auth.userId !== targetUserId) {
    await assertTenantClientDentist(auth, targetUserId);
  }
  return { userId: targetUserId, tenantId: auth.tenantId };
}

export async function resolveClientScopeForClient(auth: AuthContext, clientId: number): Promise<ClientScope | null> {
  const db = await getMongoDbOrThrow();
  const client = await db.collection('clients').findOne({
    id: clientId,
    tenant_id: auth.tenantId,
    deleted_at: { $exists: false },
  });

  if (!client || typeof client.user_id !== 'number') return null;
  if (!canAccessClientsFor(auth, client.user_id)) return null;
  return { userId: client.user_id, tenantId: auth.tenantId };
}

export async function getAssignedClientDentistOptions(auth: AuthContext) {
  if (auth.role !== 'asistent' || !auth.assigned_dentist_user_ids?.length) {
    return [];
  }

  const db = await getMongoDbOrThrow();
  const dentists = await db.collection('users').find({
    tenant_id: auth.tenantId,
    id: { $in: auth.assigned_dentist_user_ids },
    role: { $in: ['owner', 'dentist'] },
    status: { $ne: 'deleted' },
  }, {
    projection: { id: 1, name: 1, email: 1 },
  }).sort({ name: 1 }).toArray();

  return dentists
    .filter((dentist: any) => typeof dentist.id === 'number')
    .map((dentist: any) => ({
      userId: dentist.id as number,
      name: dentist.name || dentist.email || `Dentist ${dentist.id}`,
    }));
}
