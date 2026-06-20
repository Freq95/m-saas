import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, addDays, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { ObjectId } from 'mongodb';

// Loosely-typed projections of the Mongo docs this module reads. Typing them
// (vs `any`) catches field-name typos and missing null-handling at compile time.
type DashAppointment = {
  id: number;
  client_id?: number | null;
  service_id?: number;
  service_name?: string;
  client_name: string;
  start_time: string;
  end_time: string;
  status: string;
  price_at_time?: number;
  category?: string | null;
  dentist_id?: number;
};
type DashService = { id: number; name?: string; price?: number };
type DashCountRow = { _id?: string; count?: number; total?: number };

type DashboardData = {
  messagesPerDay: Array<{ date: string; count: number }>;
  appointmentsPerDay: Array<{ date: string; count: number }>;
  today: {
    messages: number;
    appointments: number;
    urgentCount: number;
    totalClients: number;
    appointmentsList: Array<{
      id: number;
      client_id: number | null;
      client_name: string;
      service_name: string;
      start_time: string;
      end_time: string;
      status: string;
      category: string | null;
      dentist_name: string | null;
    }>;
  };
  weekAppointments: number;
  weekChart: Array<{ label: string; count: number; isToday: boolean }>;
  monthRevenue: number;
  monthRevenueDeltaPct: number | null;
  noShowRate: number;
  noShowDeltaPct: number;
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
  user_id: number | { $in: number[] };
  tenant_id?: ObjectId;
};

function buildScopeFilter(userIdOrIds: number | number[], tenantId?: ObjectId): ScopeFilter {
  const ids = Array.isArray(userIdOrIds)
    ? Array.from(new Set(userIdOrIds)).sort((a, b) => a - b)
    : [userIdOrIds];
  const user_id = ids.length === 1 ? ids[0] : { $in: ids };

  if (tenantId) {
    return { user_id, tenant_id: tenantId };
  }
  return { user_id };
}

export async function getDashboardData(
  userId: number,
  tenantIdOrDays?: ObjectId | number,
  days: number = 7,
  visibleCalendarIds?: number[],
  visibleClientUserIds?: number[]
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
    const monthEndIso = endOfMonth(now).toISOString();
    const lastMonthStartIso = startOfMonth(subMonths(now, 1)).toISOString();
    // Used by the "Pacienti Inactivi" filter so a patient with an upcoming
    // appointment never shows as inactive, regardless of how long ago
    // their last completed visit was.
    const nowIsoForInactive = now.toISOString();
    const todayStr = format(now, 'yyyy-MM-dd');

    const scopedUserIds = visibleClientUserIds && visibleClientUserIds.length > 0
      ? Array.from(new Set(visibleClientUserIds)).sort((a, b) => a - b)
      : [userId];
    const serviceScopeUserIds = scopedUserIds.length > 0 ? scopedUserIds : [userId];
    const serviceUserFilter = serviceScopeUserIds.length === 1
      ? serviceScopeUserIds[0]
      : { $in: serviceScopeUserIds };
    const scopeFilter = buildScopeFilter(scopedUserIds, tenantId);
    const appointmentScopeFilter =
      visibleCalendarIds && visibleCalendarIds.length > 0
        ? { calendar_id: { $in: visibleCalendarIds } }
        : scopeFilter;
    const activeClientsFilter: Record<string, unknown> = {
      ...scopeFilter,
      deleted_at: { $exists: false },
    };

    const appointmentProjection = {
      id: 1,
      client_id: 1,
      service_id: 1,
      service_name: 1,
      client_name: 1,
      start_time: 1,
      end_time: 1,
      status: 1,
      price_at_time: 1,
      category: 1,
      dentist_id: 1,
    };

    const appointmentsRangeQuery = db
      .collection('appointments')
      .find({
        ...appointmentScopeFilter,
        deleted_at: { $exists: false },
        start_time: { $gte: startIso, $lte: endIso },
      })
      .project(appointmentProjection);
    const todayAppointmentsQuery = db
      .collection('appointments')
      .find({
        ...appointmentScopeFilter,
        deleted_at: { $exists: false },
        start_time: { $gte: todayStartIso, $lte: todayEndIso },
      })
      .project(appointmentProjection)
      .sort({ start_time: 1 });
    const conversationsQuery = db
      .collection('conversations')
      .find(scopeFilter)
      .project({ id: 1 });
    // This-month + last-month appointments, reduced in-memory with the same
    // price_at_time → service.price fallback as estimatedRevenue (below) so the
    // "Venituri · lună" stat isn't undercounted when prices weren't snapshotted.
    const monthAppointmentsQuery = db
      .collection('appointments')
      .find({
        ...appointmentScopeFilter,
        deleted_at: { $exists: false },
        status: { $in: ['scheduled', 'completed'] },
        start_time: { $gte: lastMonthStartIso, $lte: monthEndIso },
      })
      .project({ service_id: 1, price_at_time: 1, start_time: 1 });
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
              // A future scheduled appointment counts as "still engaged".
              // next_scheduled_date is null when none exists; the $ifNull
              // fallback to a past sentinel means the inequality fails and
              // the client stays in the inactive list.
              { $lt: [{ $ifNull: ['$next_scheduled_date', '1970-01-01T00:00:00.000Z'] }, nowIsoForInactive] },
              // Brand-new patients haven't had time to be "active" yet; if
              // they were added in the last 30 days, don't flag them as
              // inactive just because they have no appointment history.
              { $lt: ['$created_at', thirtyDaysAgoIso] },
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
      monthAppointmentsRaw,
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
      monthAppointmentsQuery.toArray(),
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
        { $limit: 10000 },
        {
          $group: {
            _id: { $substrBytes: ['$event_at', 0, 10] },
            count: { $sum: 1 },
          },
        },
      ];
      const messagesAggCursor = db.collection('messages').aggregate(messagesPipeline);
      const messageRows = await messagesAggCursor.toArray();
      for (const row of messageRows as DashCountRow[]) {
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
        [...appointmentsInRange, ...todayAppointmentsRaw, ...monthAppointmentsRaw]
          .map((appointment) => appointment.service_id)
          .filter((serviceId: unknown): serviceId is number => typeof serviceId === 'number')
      )
    );

    const servicesQuery = db.collection('services')
      .find(
        tenantId
          ? { tenant_id: tenantId, user_id: serviceUserFilter, id: { $in: serviceIds } }
          : { user_id: serviceUserFilter, id: { $in: serviceIds } }
      )
      .project({ id: 1, name: 1, price: 1 });
    const services = serviceIds.length > 0 ? await servicesQuery.toArray() : [];
    const servicesMap = new Map<number, DashService>((services as DashService[]).map((service) => [service.id, service]));

    const normalizedAppointmentStatuses = (appointmentsInRange as DashAppointment[]).map((appointment) => ({
      ...appointment,
      status: appointment.status === 'no_show' ? 'no-show' : appointment.status,
    }));
    const noShows = normalizedAppointmentStatuses.filter(
      (appointment) => appointment.status === 'no-show'
    ).length;
    const totalAppointments = normalizedAppointmentStatuses.filter((appointment) =>
      ['scheduled', 'completed', 'no-show', 'cancelled'].includes(appointment.status)
    ).length;
    const noShowRate = totalAppointments > 0 ? (noShows / totalAppointments) * 100 : 0;

    const estimatedRevenue = (appointmentsInRange as DashAppointment[])
      .filter((appointment) => ['scheduled', 'completed'].includes(appointment.status))
      .reduce((sum: number, appointment: any) => {
        const service = servicesMap.get(appointment.service_id);
        const price = typeof appointment.price_at_time === 'number'
          ? appointment.price_at_time
          : (typeof service?.price === 'number' ? service.price : 0);
        return sum + price;
      }, 0);

    // Calendar-week appointment count (Mon–Sun) for the "Săptămâna aceasta" card.
    const calWeekStartIso = startOfWeek(now, { weekStartsOn: 1 }).toISOString();
    const calWeekEndIso = endOfWeek(now, { weekStartsOn: 1 }).toISOString();
    const weekAppointments = await db.collection('appointments').countDocuments({
      ...appointmentScopeFilter,
      deleted_at: { $exists: false },
      start_time: { $gte: calWeekStartIso, $lte: calWeekEndIso },
    });

    // Per-weekday counts for the "Săptămâna aceasta" bar chart (Mon–Sun).
    const weekRows = await db.collection('appointments').aggregate([
      {
        $match: {
          ...appointmentScopeFilter,
          deleted_at: { $exists: false },
          start_time: { $gte: calWeekStartIso, $lte: calWeekEndIso },
        },
      },
      { $group: { _id: { $substrBytes: ['$start_time', 0, 10] }, count: { $sum: 1 } } },
    ]).toArray();
    const weekCountByDate = new Map<string, number>();
    for (const row of weekRows as DashCountRow[]) {
      if (typeof row?._id === 'string') weekCountByDate.set(row._id, row.count || 0);
    }
    const calWeekStartDate = startOfWeek(now, { weekStartsOn: 1 });
    const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
    const weekChart = WEEKDAY_LABELS.map((label, i) => {
      const date = format(addDays(calWeekStartDate, i), 'yyyy-MM-dd');
      return { label, count: weekCountByDate.get(date) || 0, isToday: date === todayStr };
    });

    // Monthly revenue (this month vs last month) for the "Venituri · lună" stat.
    const revenueByMonth = new Map<string, number>();
    for (const appointment of monthAppointmentsRaw as any[]) {
      if (typeof appointment?.start_time !== 'string') continue;
      const monthKey = appointment.start_time.slice(0, 7);
      const service = servicesMap.get(appointment.service_id);
      const price = typeof appointment.price_at_time === 'number'
        ? appointment.price_at_time
        : (typeof service?.price === 'number' ? service.price : 0);
      revenueByMonth.set(monthKey, (revenueByMonth.get(monthKey) || 0) + price);
    }
    const monthRevenue = revenueByMonth.get(format(now, 'yyyy-MM')) || 0;
    const lastMonthRevenue = revenueByMonth.get(format(subMonths(now, 1), 'yyyy-MM')) || 0;
    // null when there's no meaningful prior baseline (e.g. a brand-new clinic),
    // so the UI can omit the badge rather than show a misleading "0%". When a
    // real baseline exists, clamp so a tiny last month can't yield an absurd %.
    const monthRevenueDeltaPct = lastMonthRevenue >= 100
      ? Math.max(-99, Math.min(200, Math.round(((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)))
      : null;

    // No-show rate change vs the previous 7-day window (percentage points).
    const prevRangeStartIso = startOfDay(subDays(now, resolvedDays * 2 - 1)).toISOString();
    const prevRangeEndIso = endOfDay(subDays(now, resolvedDays)).toISOString();
    const prevRangeAppts = await db.collection('appointments')
      .find({
        ...appointmentScopeFilter,
        deleted_at: { $exists: false },
        start_time: { $gte: prevRangeStartIso, $lte: prevRangeEndIso },
      })
      .project({ status: 1 })
      .toArray();
    const prevCountable = (prevRangeAppts as DashAppointment[]).filter((a) =>
      ['scheduled', 'completed', 'no-show', 'no_show', 'cancelled'].includes(a.status)
    );
    const prevNoShows = prevCountable.filter((a) => a.status === 'no-show' || a.status === 'no_show').length;
    const prevNoShowRate = prevCountable.length > 0 ? (prevNoShows / prevCountable.length) * 100 : 0;
    const noShowDeltaPct = Math.round((noShowRate - prevNoShowRate) * 10) / 10;

    // Resolve dentist display names for today's appointments (multi-dentist clinics).
    const dentistIds = Array.from(new Set(
      (todayAppointmentsRaw as DashAppointment[])
        .map((a) => a.dentist_id)
        .filter((id: unknown): id is number => typeof id === 'number')
    ));
    const dentistDocs = dentistIds.length > 0
      ? await db.collection('users')
          .find(
            tenantId ? { tenant_id: tenantId, id: { $in: dentistIds } } : { id: { $in: dentistIds } },
            { projection: { id: 1, name: 1 } }
          )
          .toArray()
      : [];
    const dentistNameById = new Map<number, string>(
      dentistDocs.map((d: any) => [d.id, typeof d.name === 'string' ? d.name : ''])
    );

    const urgentCount = (todayAppointmentsRaw as DashAppointment[])
      .filter((a) => a.category === 'urgenta').length;

    const todayAppointments = (todayAppointmentsRaw as DashAppointment[]).map((appointment) => {
      const service = appointment.service_id != null ? servicesMap.get(appointment.service_id) : undefined;
      return {
        id: appointment.id,
        client_id: typeof appointment.client_id === 'number' ? appointment.client_id : null,
        client_name: appointment.client_name,
        service_name: service?.name || appointment.service_name || 'Unknown',
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        status: appointment.status === 'no_show' ? 'no-show' : appointment.status,
        category: typeof appointment.category === 'string' ? appointment.category : null,
        dentist_name: (appointment.dentist_id != null ? dentistNameById.get(appointment.dentist_id) : null) || null,
      };
    });

    const growthCountsByDate = new Map<string, number>();
    for (const row of clientGrowthRows as DashCountRow[]) {
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
        urgentCount,
        totalClients,
        appointmentsList: todayAppointments,
      },
      weekAppointments,
      weekChart,
      monthRevenue: Math.round(monthRevenue * 100) / 100,
      monthRevenueDeltaPct,
      noShowRate: Math.round(noShowRate * 10) / 10,
      noShowDeltaPct,
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
