/**
 * Client Matching and Management
 * Handles finding or creating clients based on contact information
 */

import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from './db/mongo-utils';
import { ObjectId } from 'mongodb';
import {
  buildClientAppointmentFilter,
  buildServiceScopeFilter,
  collectServiceScopesFromAppointments,
} from './client-appointment-scope';

export interface Client {
  id: number;
  user_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  total_spent: number;
  total_appointments: number;
  last_appointment_date: string | null;
  last_conversation_date: string | null;
  first_contact_date: string;
  created_at: string;
  updated_at: string;
  last_activity_date?: string | null;
}

function normalizePhone(phone?: string): string | null {
  if (!phone) return null;
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  if (cleaned.startsWith('0040')) {
    cleaned = '+40' + cleaned.substring(4);
  } else if (cleaned.startsWith('40') && !cleaned.startsWith('+40')) {
    cleaned = '+40' + cleaned.substring(2);
  } else if (cleaned.startsWith('0') && cleaned.length > 1) {
    cleaned = '+40' + cleaned.substring(1);
  } else if (!cleaned.startsWith('+') && cleaned.length > 0) {
    cleaned = '+40' + cleaned;
  }

  return cleaned || null;
}

function normalizeClientDoc(doc: any): Client {
  return stripMongoId(doc) as Client;
}

function normalizeNameForCompare(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Find or create a client based on contact information
 * Matching strategy:
 * 1. Name match (case-insensitive, trimmed)
 * 2. Create new client if no name match found
 */
export async function findOrCreateClient(
  userId: number,
  tenantId: ObjectId,
  name: string,
  email?: string,
  phone?: string,
  forceNew: boolean = false,
  overwriteContactFields: boolean = false
): Promise<Client> {
  const db = await getMongoDbOrThrow();

  const normalizedEmail = email?.toLowerCase().trim() || null;
  const normalizedPhone = normalizePhone(phone);
  const normalizedName = name.trim();
  const normalizedNameKey = normalizeNameForCompare(name);

  let existingClient: Client | null = null;

  if (!forceNew && normalizedNameKey) {
    const nameMatches = await db.collection('clients').find(
      {
        tenant_id: tenantId,
        user_id: userId,
        deleted_at: { $exists: false },
        name: { $type: 'string' },
        $expr: {
          $eq: [
            { $trim: { input: { $toLower: '$name' } } },
            normalizedNameKey,
          ],
        },
      },
    ).sort({ last_activity_date: -1, updated_at: -1, created_at: -1 }).toArray();

    if (nameMatches.length === 1) {
      const match = nameMatches[0];
      const matchEmail = typeof match.email === 'string' ? match.email.trim().toLowerCase() : null;
      const emailConflict = Boolean(normalizedEmail && matchEmail && matchEmail !== normalizedEmail);
      if (!emailConflict) {
        existingClient = normalizeClientDoc(match);
      }
    } else if (nameMatches.length > 1) {
      // Disambiguate same-name clients by email/phone when possible.
      if (normalizedEmail) {
        const emailMatch = nameMatches.find((client: any) =>
          typeof client.email === 'string' &&
          client.email.trim().toLowerCase() === normalizedEmail
        );
        if (emailMatch) {
          existingClient = normalizeClientDoc(emailMatch);
        }
      }

      if (!existingClient && normalizedPhone) {
        const phoneMatch = nameMatches.find((client: any) =>
          typeof client.phone === 'string' &&
          normalizePhone(client.phone) === normalizedPhone
        );
        if (phoneMatch) {
          existingClient = normalizeClientDoc(phoneMatch);
        }
      }
      // If still ambiguous, we intentionally create a new client below.
    } else {
      // Defensive fallback for Mongo variants where $expr + $trim can miss matches.
      const escaped = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regexMatches = await db.collection('clients').find(
        {
          tenant_id: tenantId,
          user_id: userId,
          deleted_at: { $exists: false },
          name: { $regex: `^\\s*${escaped}\\s*$`, $options: 'i' },
        },
      ).sort({ last_activity_date: -1, updated_at: -1, created_at: -1 }).toArray();

      if (regexMatches.length === 1) {
        const match = regexMatches[0];
        const matchEmail = typeof match.email === 'string' ? match.email.trim().toLowerCase() : null;
        const emailConflict = Boolean(normalizedEmail && matchEmail && matchEmail !== normalizedEmail);
        if (!emailConflict) {
          existingClient = normalizeClientDoc(match);
        }
      } else if (regexMatches.length > 1) {
        if (normalizedEmail) {
          const emailMatch = regexMatches.find((client: any) =>
            typeof client.email === 'string' &&
            client.email.trim().toLowerCase() === normalizedEmail
          );
          if (emailMatch) {
            existingClient = normalizeClientDoc(emailMatch);
          }
        }

        if (!existingClient && normalizedPhone) {
          const phoneMatch = regexMatches.find((client: any) =>
            typeof client.phone === 'string' &&
            normalizePhone(client.phone) === normalizedPhone
          );
          if (phoneMatch) {
            existingClient = normalizeClientDoc(phoneMatch);
          }
        }
      }
    }
  }

  if (existingClient) {
    const updates: Record<string, unknown> = {};

    const existingEmail = existingClient.email?.trim().toLowerCase() || null;
    if (
      normalizedEmail &&
      (overwriteContactFields || !existingClient.email) &&
      existingEmail !== normalizedEmail
    ) {
      updates.email = normalizedEmail;
    }

    const existingPhone = normalizePhone(existingClient.phone || undefined);
    if (
      normalizedPhone &&
      (overwriteContactFields || !existingClient.phone) &&
      existingPhone !== normalizedPhone
    ) {
      updates.phone = normalizedPhone;
    }

    if (overwriteContactFields && normalizedName && existingClient.name !== normalizedName) {
      updates.name = normalizedName;
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await db.collection('clients').updateOne(
        { id: existingClient.id, tenant_id: tenantId },
        { $set: updates }
      );
      const updated = await db.collection('clients').findOne({ id: existingClient.id, tenant_id: tenantId });
      if (updated) {
        existingClient = normalizeClientDoc(updated);
      }
    }

    return existingClient;
  }

  const now = new Date().toISOString();
  const newClientId = await getNextNumericId('clients');
  const newClientDoc = {
    _id: newClientId,
    id: newClientId,
    tenant_id: tenantId,
    user_id: userId,
    name: normalizedName,
    email: normalizedEmail,
    phone: normalizedPhone,
    notes: null,
    total_spent: 0,
    total_appointments: 0,
    last_appointment_date: null,
    last_conversation_date: null,
    first_contact_date: now,
    created_at: now,
    updated_at: now,
    last_activity_date: now,
  };

  await db.collection<FlexDoc>('clients').insertOne(newClientDoc);
  return normalizeClientDoc(newClientDoc);
}

/**
 * Update client statistics
 * Call this when appointments are created/completed
 */
export async function updateClientStats(clientId: number, tenantId: ObjectId): Promise<void> {
  const db = await getMongoDbOrThrow();

  const client = await db.collection('clients').findOne({ id: clientId, tenant_id: tenantId, deleted_at: { $exists: false } });
  if (!client) return;
  const clientUserId = typeof client.user_id === 'number' ? client.user_id : null;
  if (!clientUserId) return;

  const appointments = await db.collection('appointments').find(
    buildClientAppointmentFilter(clientId, { tenantId, userId: clientUserId })
  ).toArray();
  const serviceScopeFilter = buildServiceScopeFilter(
    collectServiceScopesFromAppointments(appointments as any[], { tenantId, userId: clientUserId })
  );

  const [services, conversations] = await Promise.all([
    serviceScopeFilter
      ? db.collection('services').find({ ...serviceScopeFilter, deleted_at: { $exists: false } }).toArray()
      : Promise.resolve([]),
    db.collection('conversations').find({ client_id: clientId, tenant_id: tenantId }).toArray(),
  ]);

  const serviceById = new Map<number, any>(
    services.map((service: any) => [service.id, service])
  );

  const completedAppointments = appointments.filter((apt: any) => apt.status === 'completed');
  const totalSpent = completedAppointments.reduce((sum: number, apt: any) => {
    const price = typeof apt.price_at_time === 'number'
      ? apt.price_at_time
      : (serviceById.get(apt.service_id)?.price ?? 0);
    return sum + price;
  }, 0);

  const totalAppointments = appointments.filter((apt: any) => ['scheduled', 'completed'].includes(apt.status)).length;

  const lastAppointmentDate = appointments
    .filter((apt: any) => apt.status === 'completed')
    .map((apt: any) => apt.start_time)
    .filter(Boolean)
    .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  const lastConversationDate = conversations
    .map((conv: any) => conv.updated_at || conv.created_at)
    .filter(Boolean)
    .sort((a: string, b: string) => new Date(b).getTime() - new Date(a).getTime())[0] || null;

  const activityCandidates = [lastAppointmentDate, lastConversationDate].filter(Boolean) as string[];
  const lastActivityDate = activityCandidates.length > 0
    ? activityCandidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    : null;

  await db.collection('clients').updateOne(
    { id: clientId, tenant_id: tenantId, deleted_at: { $exists: false } },
    {
      $set: {
        total_spent: totalSpent,
        total_appointments: totalAppointments,
        last_appointment_date: lastAppointmentDate,
        last_conversation_date: lastConversationDate,
        last_activity_date: lastActivityDate,
        updated_at: new Date().toISOString(),
      },
    }
  );
}

/**
 * Link a conversation to a client
 */
export async function linkConversationToClient(
  conversationId: number,
  clientId: number,
  tenantId: ObjectId
): Promise<void> {
  const db = await getMongoDbOrThrow();

  await db.collection('conversations').updateOne(
    { id: conversationId, tenant_id: tenantId },
    { $set: { client_id: clientId, updated_at: new Date().toISOString() } }
  );

  await updateClientStats(clientId, tenantId);
}

/**
 * Link an appointment to a client
 */
export async function linkAppointmentToClient(
  appointmentId: number,
  clientId: number,
  tenantId: ObjectId,
  clientTenantId: ObjectId = tenantId
): Promise<void> {
  const db = await getMongoDbOrThrow();

  await db.collection('appointments').updateOne(
    { id: appointmentId, tenant_id: tenantId },
    { $set: { client_id: clientId, updated_at: new Date().toISOString() } }
  );

  await updateClientStats(clientId, clientTenantId);
}
