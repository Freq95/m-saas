import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { ObjectId } from 'mongodb';

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

type ScopeFilter = {
  user_id: number;
  tenant_id?: ObjectId;
};

function buildScopeFilter(userId: number, tenantId?: ObjectId): ScopeFilter {
  if (tenantId) {
    return { user_id: userId, tenant_id: tenantId };
  }
  return { user_id: userId };
}

export async function getDashboardData(
  userId: number,
  tenantIdOrDays?: ObjectId | number,
  days: number = 7
): Promise<DashboardData> {
  const tenantId = typeof tenantIdOrDays === 'number' || tenantIdOrDays === undefined
    ? undefined
    : tenantIdOrDays;
  const resolvedDays = typeof tenantIdOrDays === 'number' ? tenantIdOrDays : days;
  const db = await getMongoDbOrThrow();

  {
    const now = new Date();
    const startDate = startOfDay(subDays(now, resolvedDays - 1));
    const endDate = endOfDay(now);
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfDay(subDays(now, 7));
    const growthStart = startOfDay(subDays(now, 6));
    const thirtyDaysAgo = subDays(now, 30);

    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();
    const todayStartIso = todayStart.toISOString();
    const todayEndIso = todayEnd.toISOString();
    const weekStartIso = weekStart.toISOString();
    const growthStartIso = growthStart.toISOString();
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();
    const todayStr = format(now, 'yyyy-MM-dd');

    const scopeFilter = buildScopeFilter(userId, tenantId);
    const activeClientsFilter: Record<string, unknown> = {
      ...scopeFilter,
      deleted_at: { $exists: false },
    };

    const appointmentProjection = {
      id: 1,
      service_id: 1,
      client_name: 1,
      start_time: 1,
      end_time: 1,
      status: 1,
    };

    const appointmentsRangeQuery = db
      .collection('appointments')
      .find({
        ...scopeFilter,
        start_time: { $gte: startIso, $lte: endIso },
      })
      .project(appointmentProjection);
    const todayAppointmentsQuery = db
      .collection('appointments')
      .find({
        ...scopeFilter,
        start_time: { $gte: todayStartIso, $lte: todayEndIso },
      })
      .project(appointmentProjection)
      .sort({ start_time: 1 });
    const conversationsQuery = db
      .collection('conversations')
      .find(scopeFilter)
      .project({ id: 1 });
    const topClientsQuery = db
      .collection('clients')
      .find({
        ...activeClientsFilter,
        total_spent: { $gt: 0 },
      })
      .project({
        _id: 1,
        id: 1,
        name: 1,
        email: 1,
        phone: 1,
        total_spent: 1,
        total_appointments: 1,
        last_appointment_date: 1,
        last_conversation_date: 1,
        last_activity_date: 1,
        first_contact_date: 1,
        created_at: 1,
        updated_at: 1,
      })
      .sort({ total_spent: -1 })
      .limit(5);
    const inactiveClientsPipeline: Record<string, unknown>[] = [
      { $match: activeClientsFilter },
      {
        $addFields: {
          sort_ts: { $ifNull: ['$last_appointment_date', { $ifNull: ['$last_conversation_date', '$created_at'] }] },
        },
      },
      {
        $match: {
          $expr: {
            $and: [
              { $lt: [{ $ifNull: ['$last_appointment_date', '1970-01-01T00:00:00.000Z'] }, thirtyDaysAgoIso] },
              { $lt: [{ $ifNull: ['$last_conversation_date', '1970-01-01T00:00:00.000Z'] }, thirtyDaysAgoIso] },
            ],
          },
        },
      },
      { $sort: { sort_ts: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 1,
          id: 1,
          name: 1,
          email: 1,
          phone: 1,
          total_spent: 1,
          total_appointments: 1,
          last_appointment_date: 1,
          last_conversation_date: 1,
          last_activity_date: 1,
          first_contact_date: 1,
          created_at: 1,
          updated_at: 1,
        },
      },
    ];
    const clientGrowthPipeline: Record<string, unknown>[] = [
      {
        $match: {
          ...activeClientsFilter,
          created_at: { $gte: growthStartIso, $lte: todayEndIso },
        },
      },
      {
        $group: {
          _id: { $substrBytes: ['$created_at', 0, 10] },
          count: { $sum: 1 },
        },
      },
    ];

    const [
      appointmentsInRange,
      todayAppointmentsRaw,
      conversations,
      totalClients,
      topClientsRaw,
      inactiveClientsRaw,
      newClientsToday,
      newClientsWeek,
      clientGrowthRows,
    ] = await Promise.all([
      appointmentsRangeQuery.toArray(),
      todayAppointmentsQuery.toArray(),
      conversationsQuery.toArray(),
      db.collection('clients').countDocuments(activeClientsFilter),
      topClientsQuery.toArray(),
      db.collection('clients').aggregate(inactiveClientsPipeline).toArray(),
      db.collection('clients').countDocuments({
        ...activeClientsFilter,
        created_at: { $gte: todayStartIso, $lte: todayEndIso },
      }),
      db.collection('clients').countDocuments({
        ...activeClientsFilter,
        created_at: { $gte: weekStartIso },
      }),
      db.collection('clients').aggregate(clientGrowthPipeline).toArray(),
    ]);

    const conversationIds = conversations
      .map((c: any) => c.id)
      .filter((id: unknown): id is number => typeof id === 'number');

    const messagesPerDayMap = new Map<string, number>();
    for (let i = 0; i < resolvedDays; i++) {
      const date = format(subDays(now, resolvedDays - 1 - i), 'yyyy-MM-dd');
      messagesPerDayMap.set(date, 0);
    }

    if (conversationIds.length > 0) {
      const messagesPipeline: Record<string, unknown>[] = [
        {
          $match: tenantId
            ? { tenant_id: tenantId, conversation_id: { $in: conversationIds } }
            : { conversation_id: { $in: conversationIds } },
        },
        {
          $project: {
            sent_at: 1,
            created_at: 1,
          },
        },
        {
          $addFields: {
            event_at: { $ifNull: ['$sent_at', '$created_at'] },
          },
        },
        {
          $match: {
            event_at: { $gte: startIso, $lte: endIso },
          },
        },
        {
          $group: {
            _id: { $substrBytes: ['$event_at', 0, 10] },
            count: { $sum: 1 },
          },
        },
      ];
      const messagesAggCursor = db.collection('messages').aggregate(messagesPipeline);
      const messageRows = await messagesAggCursor.toArray();
      for (const row of messageRows as any[]) {
        if (typeof row?._id === 'string') {
          messagesPerDayMap.set(row._id, row.count || 0);
        }
      }
    }

    const messagesPerDay = Array.from(messagesPerDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const appointmentsPerDayMap = new Map<string, number>();
    for (const appointment of appointmentsInRange as any[]) {
      if (typeof appointment?.start_time !== 'string') {
        continue;
      }
      const date = appointment.start_time.slice(0, 10);
      appointmentsPerDayMap.set(date, (appointmentsPerDayMap.get(date) || 0) + 1);
    }
    const appointmentsPerDay = Array.from(appointmentsPerDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const serviceIds = Array.from(
      new Set(
        [...appointmentsInRange, ...todayAppointmentsRaw]
          .map((appointment: any) => appointment.service_id)
          .filter((serviceId: unknown): serviceId is number => typeof serviceId === 'number')
      )
    );

    const servicesQuery = db.collection('services')
      .find(
        tenantId
          ? { tenant_id: tenantId, user_id: userId, id: { $in: serviceIds } }
          : { user_id: userId, id: { $in: serviceIds } }
      )
      .project({ id: 1, name: 1, price: 1 });
    const services = serviceIds.length > 0 ? await servicesQuery.toArray() : [];
    const servicesMap = new Map<number, any>(services.map((service: any) => [service.id, service]));

    const noShows = (appointmentsInRange as any[]).filter(
      (appointment: any) => appointment.status === 'no_show' || appointment.status === 'no-show'
    ).length;
    const totalAppointments = (appointmentsInRange as any[]).filter((appointment: any) =>
      ['scheduled', 'completed', 'no_show', 'no-show', 'cancelled'].includes(appointment.status)
    ).length;
    const noShowRate = totalAppointments > 0 ? (noShows / totalAppointments) * 100 : 0;

    const estimatedRevenue = (appointmentsInRange as any[])
      .filter((appointment: any) => ['scheduled', 'completed'].includes(appointment.status))
      .reduce((sum: number, appointment: any) => {
        const service = servicesMap.get(appointment.service_id);
        return sum + (typeof service?.price === 'number' ? service.price : 0);
      }, 0);

    const todayAppointments = (todayAppointmentsRaw as any[]).map((appointment: any) => {
      const service = servicesMap.get(appointment.service_id);
      return {
        id: appointment.id,
        client_name: appointment.client_name,
        service_name: service?.name || 'Unknown',
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        status: appointment.status,
      };
    });

    const growthCountsByDate = new Map<string, number>();
    for (const row of clientGrowthRows as any[]) {
      if (typeof row?._id === 'string') {
        growthCountsByDate.set(row._id, row.count || 0);
      }
    }
    const clientGrowth = [];
    for (let i = 0; i < 7; i++) {
      const date = format(subDays(now, 6 - i), 'yyyy-MM-dd');
      clientGrowth.push({
        date,
        count: growthCountsByDate.get(date) || 0,
      });
    }

    const topClients = topClientsRaw.map(stripMongoId);
    const inactiveClients = inactiveClientsRaw.map(stripMongoId);
    const messagesToday = messagesPerDayMap.get(todayStr) || 0;

    return {
      messagesPerDay,
      appointmentsPerDay,
      today: {
        messages: messagesToday,
        appointments: todayAppointments.length,
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
  }
}
