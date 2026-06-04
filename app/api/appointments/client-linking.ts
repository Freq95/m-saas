import type { Db, ObjectId } from 'mongodb';
import { findOrCreateClient } from '@/lib/client-matching';

export class ExplicitClientSelectionError extends Error {
  constructor() {
    super('Pacientul selectat nu mai exista. Selecteaza din nou pacientul sau continua ca pacient nou.');
    this.name = 'ExplicitClientSelectionError';
  }
}

interface ResolveAppointmentClientLinkArgs {
  db: Db;
  userId: number;
  tenantId: ObjectId;
  clientId?: number | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  forceNewClient?: boolean;
  overwriteContactFields?: boolean;
}

export async function resolveAppointmentClientLink({
  db,
  userId,
  tenantId,
  clientId,
  name,
  email,
  phone,
  forceNewClient = false,
  overwriteContactFields = false,
}: ResolveAppointmentClientLinkArgs) {
  if (typeof clientId === 'number' && Number.isInteger(clientId) && clientId > 0) {
    const explicitClient = await db.collection('clients').findOne({
      id: clientId,
      user_id: userId,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    });

    if (!explicitClient) {
      throw new ExplicitClientSelectionError();
    }

    return explicitClient as unknown as {
      id: number;
      name?: string | null;
      email?: string | null;
      phone?: string | null;
    };
  }

  return findOrCreateClient(
    userId,
    tenantId,
    name || '',
    email || undefined,
    phone || undefined,
    forceNewClient,
    overwriteContactFields
  );
}
