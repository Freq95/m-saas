import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';

type ProfileClient = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  total_spent: number;
  total_appointments: number;
  last_appointment_date: string | null;
  last_conversation_date: string | null;
  first_contact_date: string;
};

type ProfileAppointment = {
  id: number;
  service_name: string;
  service_price: number;
  start_time: string;
  end_time: string;
  status: string;
  notes: string | null;
};

type ProfileConversation = {
  id: number;
  channel: string;
  subject: string;
  status: string;
  message_count: number;
  updated_at: string;
};

type ClientProfileData = {
  client: ProfileClient;
  appointments: ProfileAppointment[];
  conversations: ProfileConversation[];
};

type ClientStatsData = {
  average_appointment_value: number;
  visit_frequency: number;
  no_show_rate: number;
  completed_appointments: number;
  preferred_services: Array<{ name: string; count: number; total_spent: number }>;
};

export async function getClientProfileData(clientId: number): Promise<ClientProfileData | null> {
  const db = await getMongoDbOrThrow();

  const clientDoc = await db.collection('clients').findOne({
    id: clientId,
    deleted_at: { $exists: false },
  });
  if (!clientDoc) return null;

  const client = stripMongoId(clientDoc) as ProfileClient;

  const [appointments, services, conversations] = await Promise.all([
    db.collection('appointments').find({ client_id: clientId }).sort({ start_time: -1 }).toArray(),
    db.collection('services').find({}).toArray(),
    db.collection('conversations').find({ client_id: clientId }).sort({ updated_at: -1 }).toArray(),
  ]);

  const serviceById = new Map<number, any>(
    services.map((service: any) => [service.id, service])
  );

  const enrichedAppointments = appointments.map((appointment: any) => {
    const service = serviceById.get(appointment.service_id);
    return {
      ...stripMongoId(appointment),
      service_name: service?.name || '',
      service_price: service?.price || 0,
    } as ProfileAppointment;
  }) as ProfileAppointment[];

  const conversationIds = conversations.map((conv: any) => conv.id);
  let messageCounts = new Map<number, number>();
  if (conversationIds.length > 0) {
    const messages = await db
      .collection('messages')
      .find({ conversation_id: { $in: conversationIds } })
      .toArray();
    for (const message of messages) {
      const count = messageCounts.get(message.conversation_id) || 0;
      messageCounts.set(message.conversation_id, count + 1);
    }
  }

  const enrichedConversations = conversations.map((conv: any) => ({
    ...stripMongoId(conv),
    subject: conv.subject || '',
    message_count: messageCounts.get(conv.id) || 0,
  })) as ProfileConversation[];

  return {
    client,
    appointments: enrichedAppointments,
    conversations: enrichedConversations,
  };
}

export async function getClientStatsData(clientId: number): Promise<ClientStatsData | null> {
  const db = await getMongoDbOrThrow();

  const clientDoc = await db.collection('clients').findOne({
    id: clientId,
    deleted_at: { $exists: false },
  });
  if (!clientDoc) return null;

  const [appointments, services] = await Promise.all([
    db.collection('appointments').find({ client_id: clientId }).toArray(),
    db.collection('services').find({}).toArray(),
  ]);

  const serviceById = new Map<number, any>(
    services.map((service: any) => [service.id, service])
  );

  const completedAppointments = appointments.filter((apt: any) => apt.status === 'completed');
  const completedCount = completedAppointments.length;

  const totalSpent = completedAppointments.reduce((sum: number, apt: any) => {
    const service = serviceById.get(apt.service_id);
    const price = typeof service?.price === 'number' ? service.price : 0;
    return sum + price;
  }, 0);

  const averageAppointmentValue = completedCount > 0 ? totalSpent / completedCount : 0;

  const noShowCount = appointments.filter((apt: any) => apt.status === 'no_show' || apt.status === 'no-show').length;
  const noShowRate = appointments.length > 0 ? (noShowCount / appointments.length) * 100 : 0;

  const visitAppointments = appointments.filter((apt: any) => ['scheduled', 'completed'].includes(apt.status));
  let visitFrequency = 0;
  if (visitAppointments.length > 0) {
    const sorted = visitAppointments
      .map((apt: any) => apt.start_time)
      .filter(Boolean)
      .sort((a: string, b: string) => new Date(a).getTime() - new Date(b).getTime());
    if (sorted.length === 1) {
      visitFrequency = 1;
    } else if (sorted.length > 1) {
      const first = new Date(sorted[0]);
      const last = new Date(sorted[sorted.length - 1]);
      const monthsDiff = (last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24 * 30);
      visitFrequency = monthsDiff > 0 ? visitAppointments.length / monthsDiff : visitAppointments.length;
    }
  }

  const serviceStats = new Map<number, { name: string; count: number; total_spent: number }>();
  for (const appointment of completedAppointments) {
    const service = serviceById.get(appointment.service_id);
    if (!service) continue;
    const stats = serviceStats.get(service.id) || { name: service.name, count: 0, total_spent: 0 };
    stats.count += 1;
    const price = typeof service.price === 'number' ? service.price : 0;
    stats.total_spent += price;
    serviceStats.set(service.id, stats);
  }

  const preferredServices = Array.from(serviceStats.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    average_appointment_value: averageAppointmentValue,
    visit_frequency: visitFrequency,
    no_show_rate: noShowRate,
    completed_appointments: completedCount,
    preferred_services: preferredServices,
  };
}
