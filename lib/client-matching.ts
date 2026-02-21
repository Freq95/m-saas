/**
 * Client Matching and Management
 * Handles finding or creating clients based on contact information
 */

import { getMongoDbOrThrow, getNextNumericId, stripMongoId } from './db/mongo-utils';
import { ObjectId } from 'mongodb';

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

/**
 * Find or create a client based on contact information
 * Matching priority:
 * 1. Email exact match (highest priority)
 * 2. Phone exact match
 * 3. Name fuzzy match (if email/phone are missing)
 * 4. Create new client if no match found
 */
export async function findOrCreateClient(
  userId: number,
  tenantId: ObjectId,
  name: string,
  email?: string,
  phone?: string
): Promise<Client> {
  const db = await getMongoDbOrThrow();

  const normalizedEmail = email?.toLowerCase().trim() || null;
  const normalizedPhone = normalizePhone(phone);
  const normalizedName = name.trim();

  let existingClient: Client | null = null;

  if (normalizedEmail) {
    const clientsCollection = db.collection('clients');
    let client = await clientsCollection.findOne(
      {
        tenant_id: tenantId,
        user_id: userId,
        deleted_at: { $exists: false },
        email: normalizedEmail,
      }
    );
    if (!client) {
      const escaped = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      client = await clientsCollection.findOne(
        {
          tenant_id: tenantId,
          user_id: userId,
          deleted_at: { $exists: false },
          email: { $regex: `^${escaped}$`, $options: 'i' },
        }
      );
    }
    if (client) {
      existingClient = normalizeClientDoc(client);
    }
  }

  if (!existingClient && normalizedPhone) {
    const client = await db.collection('clients').findOne(
      {
        tenant_id: tenantId,
        user_id: userId,
        deleted_at: { $exists: false },
        phone: normalizedPhone,
      }
    );
    if (client) {
      existingClient = normalizeClientDoc(client);
    }
  }

  if (existingClient) {
    const updates: Record<string, unknown> = {};

    if (!existingClient.email && normalizedEmail) {
      updates.email = normalizedEmail;
    }

    if (!existingClient.phone && normalizedPhone) {
      updates.phone = normalizedPhone;
    }

    if (existingClient.name !== normalizedName) {
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

  await db.collection('clients').insertOne(newClientDoc);
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

  const [appointments, services, conversations] = await Promise.all([
    db.collection('appointments').find({ client_id: clientId, tenant_id: tenantId }).toArray(),
    db.collection('services').find({ tenant_id: tenantId }).toArray(),
    db.collection('conversations').find({ client_id: clientId, tenant_id: tenantId }).toArray(),
  ]);

  const serviceById = new Map<number, any>(
    services.map((service: any) => [service.id, service])
  );

  const completedAppointments = appointments.filter((apt: any) => apt.status === 'completed');
  const totalSpent = completedAppointments.reduce((sum: number, apt: any) => {
    const service = serviceById.get(apt.service_id);
    const price = typeof service?.price === 'number' ? service.price : 0;
    return sum + price;
  }, 0);

  const totalAppointments = appointments.filter((apt: any) => ['scheduled', 'completed'].includes(apt.status)).length;

  const lastAppointmentDate = appointments
    .filter((apt: any) => ['scheduled', 'completed'].includes(apt.status))
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
  tenantId: ObjectId
): Promise<void> {
  const db = await getMongoDbOrThrow();

  await db.collection('appointments').updateOne(
    { id: appointmentId, tenant_id: tenantId },
    { $set: { client_id: clientId, updated_at: new Date().toISOString() } }
  );

  await updateClientStats(clientId, tenantId);
}

/**
 * Get client segments
 * Returns clients grouped by segments: VIP, inactive, new, frequent
 */
export interface ClientSegments {
  vip: Client[];
  inactive: Client[];
  new: Client[];
  frequent: Client[];
}

export async function getClientSegments(
  userId: number,
  tenantId: ObjectId,
  options: {
    vipThreshold?: number; // Default: 1000 RON
    inactiveDays?: number; // Default: 30 days
    newDays?: number; // Default: 7 days
    frequentAppointmentsPerMonth?: number; // Default: 2 appointments/month
  } = {}
): Promise<ClientSegments> {
  const db = await getMongoDbOrThrow();

  const vipThreshold = options.vipThreshold || 1000;
  const inactiveDays = options.inactiveDays || 30;
  const newDays = options.newDays || 7;
  const frequentAppointmentsPerMonth = options.frequentAppointmentsPerMonth || 2;

  const now = new Date();
  const inactiveDate = new Date(now);
  inactiveDate.setDate(inactiveDate.getDate() - inactiveDays);

  const newDate = new Date(now);
  newDate.setDate(newDate.getDate() - newDays);

  const clients: Client[] = (await db.collection('clients').find({
    tenant_id: tenantId,
    user_id: userId,
    deleted_at: { $exists: false },
  }).toArray())
    .map(normalizeClientDoc);

  const vip = clients
    .filter((client: Client) => client.total_spent >= vipThreshold)
    .sort((a: Client, b: Client) => b.total_spent - a.total_spent);

  const inactive = clients
    .filter((client: Client) => {
      const lastAppointment = client.last_appointment_date ? new Date(client.last_appointment_date) : null;
      const lastConversation = client.last_conversation_date ? new Date(client.last_conversation_date) : null;
      const appointmentOk = !lastAppointment || lastAppointment < inactiveDate;
      const conversationOk = !lastConversation || lastConversation < inactiveDate;
      return appointmentOk && conversationOk;
    })
    .sort((a: Client, b: Client) => {
      const dateA = new Date(a.last_appointment_date || a.last_conversation_date || a.created_at).getTime();
      const dateB = new Date(b.last_appointment_date || b.last_conversation_date || b.created_at).getTime();
      return dateB - dateA;
    });

  const newClients = clients
    .filter((client: Client) => new Date(client.created_at) >= newDate)
    .sort((a: Client, b: Client) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const appointmentRows = await db.collection('appointments').find({
    tenant_id: tenantId,
    user_id: userId,
    status: { $in: ['scheduled', 'completed'] },
    client_id: { $ne: null },
  }).toArray();

  const statsByClient = new Map<number, { count: number; first: string; last: string }>();
  for (const apt of appointmentRows) {
    if (!apt.client_id || !apt.start_time) continue;
    const clientStats = statsByClient.get(apt.client_id) || {
      count: 0,
      first: apt.start_time,
      last: apt.start_time,
    };
    clientStats.count += 1;
    if (new Date(apt.start_time) < new Date(clientStats.first)) {
      clientStats.first = apt.start_time;
    }
    if (new Date(apt.start_time) > new Date(clientStats.last)) {
      clientStats.last = apt.start_time;
    }
    statsByClient.set(apt.client_id, clientStats);
  }

  const frequent: Client[] = [];
  for (const client of clients) {
    const stats = statsByClient.get(client.id);
    if (!stats || stats.count === 0) continue;

    const firstApp = new Date(stats.first);
    const lastApp = new Date(stats.last);
    const monthsDiff = (lastApp.getTime() - firstApp.getTime()) / (1000 * 60 * 60 * 24 * 30);
    const appointmentsPerMonth = monthsDiff > 0 ? stats.count / monthsDiff : stats.count;

    if (appointmentsPerMonth >= frequentAppointmentsPerMonth) {
      frequent.push(client);
    }
  }

  return {
    vip,
    inactive,
    new: newClients,
    frequent,
  };
}
