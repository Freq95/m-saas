import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { ObjectId } from 'mongodb';
import { getServiceOwnerScopeFromAppointment } from '@/lib/appointment-service';
import { getDentistColorHex, isDentistColorId } from '@/lib/calendar-color-policy';

type AppointmentQuery = {
  userId?: number;
  tenantId?: ObjectId;
  calendarIds?: number[];
  startDate?: string | Date;
  endDate?: string | Date;
  status?: string;
  search?: string;
};

const SERVICES_PROJECTION = {
  _id: 1,
  id: 1,
  name: 1,
  duration_minutes: 1,
  price: 1,
  user_id: 1,
  tenant_id: 1,
  description: 1,
  created_at: 1,
  updated_at: 1,
};

function buildServiceScopeFilter(scopes: Array<{ userId: number; tenantId: ObjectId }>): Record<string, unknown> | null {
  if (scopes.length === 0) {
    return null;
  }

  if (scopes.length === 1) {
    return {
      user_id: scopes[0].userId,
      tenant_id: scopes[0].tenantId,
      deleted_at: { $exists: false },
    };
  }

  return {
    deleted_at: { $exists: false },
    $or: scopes.map((scope) => ({
      user_id: scope.userId,
      tenant_id: scope.tenantId,
    })),
  };
}

function buildServiceScopesFromAppointments(appointments: any[]) {
  const seenScopes = new Set<string>();
  const scopes: Array<{ userId: number; tenantId: ObjectId }> = [];

  for (const appointment of appointments) {
    const scope = getServiceOwnerScopeFromAppointment(appointment);
    if (!scope) {
      continue;
    }

    const key = `${scope.serviceOwnerTenantId.toString()}:${scope.serviceOwnerUserId}`;
    if (seenScopes.has(key)) {
      continue;
    }

    seenScopes.add(key);
    scopes.push({
      userId: scope.serviceOwnerUserId,
      tenantId: scope.serviceOwnerTenantId,
    });
  }

  return scopes;
}

type CalendarDisplayAppointment = {
  calendar_id?: number | null;
  user_id?: number | null;
  created_by_user_id?: ObjectId | string | null;
  dentist_db_user_id?: ObjectId | string | null;
  calendar_name?: string | null;
  color_mine?: string | null;
  color_others?: string | null;
  dentist_color?: string | null;
  dentist_display_name?: string | null;
  is_default_calendar?: boolean | null;
  is_shared_calendar?: boolean | null;
  [key: string]: unknown;
};

type CalendarDisplayMeta = {
  name: string | null;
  color_mine: string | null;
  color_others: string | null;
  ownerDbUserId: string | null;
  isDefault: boolean;
  isShared: boolean;
};

async function loadCalendarDisplayMaps(
  db: Awaited<ReturnType<typeof getMongoDbOrThrow>>,
  calendarIds: number[]
): Promise<{
  calendarById: Map<number, CalendarDisplayMeta>;
  dentistNameByDbUserId: Map<string, string | null>;
  dentistColorByCalendarAndUser: Map<string, string | null>;
}> {
  const normalizedCalendarIds = Array.from(new Set(calendarIds.filter((id): id is number => Number.isInteger(id) && id > 0)));
  if (normalizedCalendarIds.length === 0) {
    return {
      calendarById: new Map<number, CalendarDisplayMeta>(),
      dentistNameByDbUserId: new Map<string, string | null>(),
      dentistColorByCalendarAndUser: new Map<string, string | null>(),
    };
  }

  const [calendarDocs, shareDocs] = await Promise.all([
    db.collection('calendars').find(
      {
        id: { $in: normalizedCalendarIds },
        deleted_at: { $exists: false },
      },
      {
        projection: {
          id: 1,
          name: 1,
          color_mine: 1,
          color_others: 1,
          owner_db_user_id: 1,
          is_default: 1,
        },
      }
    ).toArray(),
    db.collection('calendar_shares').find(
      {
        calendar_id: { $in: normalizedCalendarIds },
        status: 'accepted',
        shared_with_user_id: { $ne: null },
      },
      {
        projection: {
          calendar_id: 1,
          shared_with_user_id: 1,
          dentist_display_name: 1,
          dentist_color: 1,
        },
      }
    ).toArray(),
  ]);

  const ownerDbUserIds = calendarDocs
    .map((calendar) => (
      calendar.owner_db_user_id instanceof ObjectId
        ? calendar.owner_db_user_id
        : typeof calendar.owner_db_user_id === 'string' && ObjectId.isValid(calendar.owner_db_user_id)
          ? new ObjectId(calendar.owner_db_user_id)
          : null
    ))
    .filter((value): value is ObjectId => Boolean(value));
  const shareDbUserIds = shareDocs
    .map((share) => (
      share.shared_with_user_id instanceof ObjectId
        ? share.shared_with_user_id
        : typeof share.shared_with_user_id === 'string' && ObjectId.isValid(share.shared_with_user_id)
          ? new ObjectId(share.shared_with_user_id)
          : null
    ))
    .filter((value): value is ObjectId => Boolean(value));
  const uniqueUserIds = Array.from(
    new Map(
      [...ownerDbUserIds, ...shareDbUserIds].map((userId) => [userId.toString(), userId])
    ).values()
  );
  const users = uniqueUserIds.length > 0
    ? await db.collection('users').find(
        { _id: { $in: uniqueUserIds } },
        {
          projection: {
            _id: 1,
            name: 1,
            email: 1,
            color: 1,
          },
        }
      ).toArray()
    : [];
  const userById = new Map<string, { name?: string; email?: string; color?: string }>(
    users.map((user: any) => [String(user._id), { name: user.name, email: user.email, color: user.color }])
  );
  const sharedCalendarIds = new Set(
    shareDocs
      .map((share) => share.calendar_id)
      .filter((calendarId): calendarId is number => typeof calendarId === 'number')
  );

  const calendarById = new Map<number, CalendarDisplayMeta>();
  for (const calendar of calendarDocs) {
    if (typeof calendar.id !== 'number') {
      continue;
    }

    calendarById.set(calendar.id, {
      name: typeof calendar.name === 'string' ? calendar.name : null,
      color_mine: typeof calendar.color_mine === 'string' ? calendar.color_mine : null,
      color_others: typeof calendar.color_others === 'string' ? calendar.color_others : null,
      ownerDbUserId:
        calendar.owner_db_user_id instanceof ObjectId
          ? calendar.owner_db_user_id.toString()
          : typeof calendar.owner_db_user_id === 'string'
            ? calendar.owner_db_user_id
            : null,
      isDefault: Boolean(calendar.is_default),
      isShared: sharedCalendarIds.has(calendar.id),
    });
  }

  const dentistNameByDbUserId = new Map<string, string | null>();
  for (const share of shareDocs) {
    const creatorId = share.shared_with_user_id instanceof ObjectId
      ? share.shared_with_user_id.toString()
      : typeof share.shared_with_user_id === 'string'
        ? share.shared_with_user_id
        : null;
    if (!creatorId) continue;
    const fromShare = typeof share.dentist_display_name === 'string' && share.dentist_display_name.trim()
      ? share.dentist_display_name.trim()
      : null;
    dentistNameByDbUserId.set(creatorId, fromShare || userById.get(creatorId)?.name || null);
  }
  for (const [, calendar] of calendarById.entries()) {
    if (calendar.ownerDbUserId && !dentistNameByDbUserId.has(calendar.ownerDbUserId)) {
      dentistNameByDbUserId.set(calendar.ownerDbUserId, userById.get(calendar.ownerDbUserId)?.name || null);
    }
  }

  // Map `${calendarId}:${dentistDbUserId}` → resolved hex (per-calendar color model).
  // Priority: per-calendar color (calendar.color_mine for owner, share.dentist_color for recipient)
  // Fallback: global users.color for legacy appointments.
  const dentistColorByCalendarAndUser = new Map<string, string | null>();

  for (const [calId, calendar] of calendarById.entries()) {
    if (!calendar.ownerDbUserId) continue;
    const calHex = isDentistColorId(calendar.color_mine)
      ? getDentistColorHex(calendar.color_mine)
      : null;
    const fallbackHex = (() => {
      const info = userById.get(calendar.ownerDbUserId);
      return info?.color && isDentistColorId(info.color) ? getDentistColorHex(info.color) : null;
    })();
    dentistColorByCalendarAndUser.set(`${calId}:${calendar.ownerDbUserId}`, calHex ?? fallbackHex ?? null);
  }

  for (const share of shareDocs) {
    const recipientId = share.shared_with_user_id instanceof ObjectId
      ? share.shared_with_user_id.toString()
      : typeof share.shared_with_user_id === 'string'
        ? share.shared_with_user_id
        : null;
    if (!recipientId || typeof share.calendar_id !== 'number') continue;
    const shareHex = isDentistColorId(share.dentist_color)
      ? getDentistColorHex(share.dentist_color)
      : null;
    const fallbackHex = (() => {
      const info = userById.get(recipientId);
      return info?.color && isDentistColorId(info.color) ? getDentistColorHex(info.color) : null;
    })();
    dentistColorByCalendarAndUser.set(`${share.calendar_id}:${recipientId}`, shareHex ?? fallbackHex ?? null);
  }

  return {
    calendarById,
    dentistNameByDbUserId,
    dentistColorByCalendarAndUser,
  };
}

export async function attachCalendarDisplayData<T extends CalendarDisplayAppointment>(
  appointments: T[],
  _viewerUserId?: number | null
): Promise<T[]> {
  if (appointments.length === 0) {
    return appointments;
  }

  const db = await getMongoDbOrThrow();
  const calendarIds = appointments
    .map((appointment) => appointment.calendar_id)
    .filter((id): id is number => typeof id === 'number' && id > 0);

  const { calendarById, dentistNameByDbUserId, dentistColorByCalendarAndUser } = await loadCalendarDisplayMaps(db, calendarIds);

  return appointments.map((appointment) => {
    if (typeof appointment.calendar_id !== 'number') {
      return appointment;
    }

    const calendar = calendarById.get(appointment.calendar_id);
    if (!calendar) {
      return appointment;
    }

    const createdByUserId = appointment.created_by_user_id instanceof ObjectId
      ? appointment.created_by_user_id.toString()
      : typeof appointment.created_by_user_id === 'string'
        ? appointment.created_by_user_id
        : null;
    const dentistDbUserId = appointment.dentist_db_user_id instanceof ObjectId
      ? appointment.dentist_db_user_id.toString()
      : typeof appointment.dentist_db_user_id === 'string'
        ? appointment.dentist_db_user_id
        : null;
    const effectiveDentistDbUserId = dentistDbUserId || createdByUserId || calendar.ownerDbUserId || null;
    const displayName = effectiveDentistDbUserId
      ? dentistNameByDbUserId.get(effectiveDentistDbUserId) || null
      : null;
    const dentistColor = effectiveDentistDbUserId
      ? dentistColorByCalendarAndUser.get(`${appointment.calendar_id}:${effectiveDentistDbUserId}`) ?? null
      : null;

    return {
      ...appointment,
      created_by_user_id: createdByUserId,
      dentist_db_user_id: effectiveDentistDbUserId,
      calendar_name: appointment.calendar_name || calendar.name,
      color_mine: appointment.color_mine || calendar.color_mine,
      color_others: appointment.color_others || calendar.color_others,
      dentist_color: appointment.dentist_color || dentistColor,
      dentist_display_name: appointment.dentist_display_name || displayName,
      is_default_calendar: calendar.isDefault,
      is_shared_calendar: calendar.isShared,
    };
  });
}

export async function getAppointmentsData(query: AppointmentQuery) {
  const db = await getMongoDbOrThrow();
  const calendarIds = Array.isArray(query.calendarIds)
    ? Array.from(new Set(query.calendarIds.filter((id): id is number => Number.isInteger(id) && id > 0))).sort((a, b) => a - b)
    : [];
  const hasCalendarScope = calendarIds.length > 0;

  if (!hasCalendarScope && !query.userId) {
    throw new Error('userId is required');
  }

  if (!hasCalendarScope && !query.tenantId) {
    throw new Error('tenantId is required');
  }

  const userId = query.userId;
  const tenantId = query.tenantId;
  const startDate = query.startDate instanceof Date ? query.startDate.toISOString() : query.startDate;
  const endDate = query.endDate instanceof Date ? query.endDate.toISOString() : query.endDate;
  const status = query.status;
  const search = query.search?.trim();

  const filter: Record<string, unknown> = {
    deleted_at: { $exists: false },
    ...(status ? {} : { status: { $ne: 'cancelled' } }),
  };

  if (hasCalendarScope) {
    filter.calendar_id = { $in: calendarIds };
  } else {
    filter.user_id = userId;
    filter.tenant_id = tenantId;
  }

  if (startDate || endDate) {
    const range: Record<string, string> = {};
    if (startDate) range.$gte = startDate;
    if (endDate) range.$lte = endDate;
    filter.start_time = range;
  }
  if (status) {
    filter.status = status;
  }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    const searchOr: Record<string, unknown>[] = [
      { client_name: regex },
      { client_email: regex },
      { client_phone: regex },
      { service_name: regex },
      { category: regex },
      { notes: regex },
    ];
    filter.$or = searchOr;
  }

  const appointments = await db
    .collection('appointments')
    .find(filter)
    .project({
      _id: 1,
      id: 1,
      tenant_id: 1,
      user_id: 1,
      conversation_id: 1,
      service_id: 1,
      service_owner_user_id: 1,
      service_owner_tenant_id: 1,
      dentist_db_user_id: 1,
      dentist_id: 1,
      client_id: 1,
      client_name: 1,
      client_email: 1,
      client_phone: 1,
      start_time: 1,
      end_time: 1,
      status: 1,
      calendar_id: 1,
      created_by_user_id: 1,
      category: 1,
      color: 1,
      notes: 1,
      reminder_sent: 1,
      service_name: 1,
      price_at_time: 1,
      created_at: 1,
      updated_at: 1,
    })
    .sort({ start_time: 1 })
    .toArray()
    .then((docs: any[]) => docs.map(stripMongoId));

  const appointmentServiceScopes = buildServiceScopesFromAppointments(appointments);
  const appointmentServiceIds = Array.from(
    new Set(
      appointments
        .map((appointment: any) => appointment.service_id)
        .filter((serviceId: unknown): serviceId is number => typeof serviceId === 'number')
    )
  );
  const servicesFilter = buildServiceScopeFilter(appointmentServiceScopes);
  const services = servicesFilter && appointmentServiceIds.length > 0
    ? await db.collection('services').find({
        ...servicesFilter,
        id: { $in: appointmentServiceIds },
      }).project(SERVICES_PROJECTION).toArray().then((docs: any[]) => docs.map(stripMongoId))
    : [];

  const serviceById = new Map<number, any>(
    services.map((service: any) => [service.id, service])
  );

  const hydratedAppointments = appointments.map((appointment: any) => {
    const service = serviceById.get(appointment.service_id);
    return {
      ...appointment,
      service_name: service?.name || (appointment.service_name as string | undefined) || '',
      duration_minutes: service?.duration_minutes,
      service_price: typeof appointment.price_at_time === 'number' ? appointment.price_at_time : service?.price,
    };
  });

  return attachCalendarDisplayData(hydratedAppointments, userId);
}

export async function getServicesData(userId: number, tenantId: ObjectId) {
  const db = await getMongoDbOrThrow();
  const servicesQuery = db
    .collection('services')
    .find({ user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } })
    .project(SERVICES_PROJECTION)
    .sort({ name: 1 });
  const services = await servicesQuery.toArray();
  return services.map(stripMongoId);
}
