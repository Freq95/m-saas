import { format, startOfDay, endOfDay, subDays, isValid } from 'date-fns';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';

type DashboardData = {
  messagesPerDay: Array<{ date: string; count: number }>;
  appointmentsPerDay: Array<{ date: string; count: number }>;
  today: {
    messages: number;
    appointments: number;
    totalClients: number;
    appointmentsList: Array<{
      id: number;
      client_name: string;
      service_name: string;
      start_time: string;
      end_time: string;
      status: string;
    }>;
  };
  noShowRate: number;
  estimatedRevenue: number;
  clients: {
    topClients: Array<any>;
    newClientsToday: number;
    newClientsWeek: number;
    inactiveClients: Array<any>;
    growth: Array<{ date: string; count: number }>;
  };
};

function safeParseDate(dateValue: unknown): Date | null {
  if (!dateValue) return null;
  const date = new Date(dateValue as string);
  return isValid(date) ? date : null;
}

function emptyDashboard(): DashboardData {
  return {
    messagesPerDay: [],
    appointmentsPerDay: [],
    today: {
      messages: 0,
      appointments: 0,
      totalClients: 0,
      appointmentsList: [],
    },
    noShowRate: 0,
    estimatedRevenue: 0,
    clients: {
      topClients: [],
      newClientsToday: 0,
      newClientsWeek: 0,
      inactiveClients: [],
      growth: [],
    },
  };
}

export async function getDashboardData(userId: number, days: number): Promise<DashboardData> {
  try {
    const db = await getMongoDbOrThrow();

    const today = new Date();
    const startDate = startOfDay(subDays(today, days - 1));
    const endDate = endOfDay(today);
    const todayStr = format(today, 'yyyy-MM-dd');

    const conversations = await db
      .collection('conversations')
      .find({ user_id: userId })
      .toArray();
    const conversationIds = conversations.map((c: any) => c.id);

    const allMessages = conversationIds.length > 0
      ? await db.collection('messages').find({ conversation_id: { $in: conversationIds } }).toArray()
      : [];

    const messagesInRange = allMessages.filter((m: any) => {
      const sentAt = safeParseDate(m.sent_at || m.created_at);
      if (!sentAt) return false;
      return sentAt >= startDate && sentAt <= endDate;
    });

    const allAppointments = await db
      .collection('appointments')
      .find({ user_id: userId })
      .toArray();

    const appointmentsInRange = allAppointments.filter((a: any) => {
      const startTime = safeParseDate(a.start_time);
      if (!startTime) return false;
      return startTime >= startDate && startTime <= endDate;
    });

    const services = await db.collection('services').find({}).toArray();
    const servicesMap = new Map(services.map((s: any) => [s.id, s]));

    const messagesPerDayMap = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const date = format(subDays(today, days - 1 - i), 'yyyy-MM-dd');
      messagesPerDayMap.set(date, 0);
    }
    messagesInRange.forEach((m: any) => {
      const sentAt = safeParseDate(m.sent_at || m.created_at);
      if (!sentAt) return;
      const date = format(sentAt, 'yyyy-MM-dd');
      if (messagesPerDayMap.has(date)) {
        messagesPerDayMap.set(date, (messagesPerDayMap.get(date) || 0) + 1);
      }
    });
    const messagesPerDay = Array.from(messagesPerDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const appointmentsPerDayMap = new Map<string, number>();
    appointmentsInRange.forEach((a: any) => {
      const startTime = safeParseDate(a.start_time);
      if (!startTime) return;
      const date = format(startTime, 'yyyy-MM-dd');
      appointmentsPerDayMap.set(date, (appointmentsPerDayMap.get(date) || 0) + 1);
    });
    const appointmentsPerDay = Array.from(appointmentsPerDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const messagesToday = allMessages.filter((m: any) => {
      const sentAt = safeParseDate(m.sent_at || m.created_at);
      if (!sentAt) return false;
      return format(sentAt, 'yyyy-MM-dd') === todayStr;
    }).length;

    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    const appointmentsToday = allAppointments.filter((a: any) => {
      const startTime = safeParseDate(a.start_time);
      if (!startTime) return false;
      return startTime >= todayStart && startTime <= todayEnd;
    }).length;

    const todayAppointments = allAppointments
      .filter((a: any) => {
        const startTime = safeParseDate(a.start_time);
        if (!startTime) return false;
        return startTime >= todayStart && startTime <= todayEnd;
      })
      .map((a: any) => {
        const service: any = servicesMap.get(a.service_id);
        return {
          id: a.id,
          client_name: a.client_name,
          service_name: service?.name || 'Unknown',
          start_time: a.start_time,
          end_time: a.end_time,
          status: a.status,
        };
      })
      .sort((a: any, b: any) => {
        const aTime = safeParseDate(a.start_time);
        const bTime = safeParseDate(b.start_time);
        if (!aTime || !bTime) return 0;
        return aTime.getTime() - bTime.getTime();
      });

    const totalClients = await db.collection('clients').countDocuments({
      user_id: userId,
      deleted_at: { $exists: false },
    });

    const noShows = appointmentsInRange.filter((a: any) => a.status === 'no_show' || a.status === 'no-show').length;
    const totalAppointments = appointmentsInRange.filter((a: any) =>
      ['scheduled', 'completed', 'no_show', 'no-show', 'cancelled'].includes(a.status)
    ).length;
    const noShowRate = totalAppointments > 0 ? (noShows / totalAppointments) * 100 : 0;

    const estimatedRevenue = appointmentsInRange
      .filter((a: any) => ['scheduled', 'completed'].includes(a.status))
      .reduce((sum: number, a: any) => {
        const service: any = servicesMap.get(a.service_id);
        return sum + (service?.price || 0);
      }, 0);

    const topClients = (await db
      .collection('clients')
      .find({ user_id: userId, deleted_at: { $exists: false }, total_spent: { $gt: 0 } })
      .sort({ total_spent: -1 })
      .limit(5)
      .toArray()).map(stripMongoId);

    const clients = (await db.collection('clients').find({
      user_id: userId,
      deleted_at: { $exists: false },
    }).toArray())
      .map(stripMongoId);

    const newClientsToday = clients.filter((client: any) => {
      const created = safeParseDate(client.created_at);
      if (!created) return false;
      return format(created, 'yyyy-MM-dd') === todayStr;
    }).length;

    const weekStart = startOfDay(subDays(today, 7));
    const newClientsWeek = clients.filter((client: any) => {
      const created = safeParseDate(client.created_at);
      if (!created) return false;
      return created >= weekStart;
    }).length;

    const thirtyDaysAgo = subDays(today, 30);
    const inactiveClients = clients
      .filter((client: any) => {
        const lastAppointment = safeParseDate(client.last_appointment_date);
        const lastConversation = safeParseDate(client.last_conversation_date);
        const appointmentOk = !lastAppointment || lastAppointment < thirtyDaysAgo;
        const conversationOk = !lastConversation || lastConversation < thirtyDaysAgo;
        return appointmentOk && conversationOk;
      })
      .sort((a: any, b: any) => {
        const dateA = safeParseDate(a.last_appointment_date || a.last_conversation_date || a.created_at)?.getTime() || 0;
        const dateB = safeParseDate(b.last_appointment_date || b.last_conversation_date || b.created_at)?.getTime() || 0;
        return dateB - dateA;
      })
      .slice(0, 10);

    const clientGrowth = [];
    for (let i = 0; i < 7; i++) {
      const date = subDays(today, 6 - i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const count = clients.filter((client: any) => {
        const created = safeParseDate(client.created_at);
        if (!created) return false;
        return format(created, 'yyyy-MM-dd') === dateStr;
      }).length;
      clientGrowth.push({
        date: dateStr,
        count,
      });
    }

    return {
      messagesPerDay,
      appointmentsPerDay,
      today: {
        messages: messagesToday,
        appointments: appointmentsToday,
        totalClients,
        appointmentsList: todayAppointments,
      },
      noShowRate: Math.round(noShowRate * 10) / 10,
      estimatedRevenue: Math.round(estimatedRevenue * 100) / 100,
      clients: {
        topClients,
        newClientsToday,
        newClientsWeek,
        inactiveClients,
        growth: clientGrowth,
      },
    };
  } catch {
    return emptyDashboard();
  }
}
