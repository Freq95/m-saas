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
  // When true, do not auto-exclude cancelled appointments. The calendar
  // right-side panel uses this to render cancelled rows strikethrough.
  includeCancelled?: boolean;
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

/**
 * Mirror multi-service snapshot fields to the alias shape that client code
 * reads (`service_names`, `duration_minutes`, `service_price`). Used by POST
 * and PATCH responses so the immediate API result matches what GET returns —
 * otherwise calendar cards momentarily render in single-service form (no
 * count badge, aria-label = first service only) until a page refresh.
 *
 * No DB calls: relies entirely on fields already written to the doc.
 */
export function projectMultiServiceFields<T extends Record<string, any>>(appointment: T): T {
  const ids: number[] =
    Array.isArray(appointment.service_ids) && appointment.service_ids.length > 0
      ? appointment.service_ids.filter((id: unknown): id is number => typeof id === 'number')
      : typeof appointment.service_id === 'number'
        ? [appointment.service_id]
        : [];

  const serviceNames: string[] =
    Array.isArray(appointment.service_names_snapshot) && appointment.service_names_snapshot.length > 0
      ? (appointment.service_names_snapshot as string[])
      : appointment.service_name
        ? [appointment.service_name as string]
        : [];

  const totalPrice =
    Array.isArray(appointment.prices_at_time) && appointment.prices_at_time.length > 0
      ? (appointment.prices_at_time as number[]).reduce(
          (sum, p) => sum + (typeof p === 'number' ? p : 0),
          0
        )
      : typeof appointment.price_at_time === 'number'
        ? appointment.price_at_time
        : 0;

  return {
    ...appointment,
    service_ids: ids,
    service_names: serviceNames,
    service_name: appointment.service_name || serviceNames[0] || '',
    service_price: totalPrice,
  };
}

export async function attachCalendarDisplayData<T extends CalendarDisplayAppointment>(
  appointments: T[],
  _viewerUserId?: number | null,
  preloadedMaps?: Awaited<ReturnType<typeof loadCalendarDisplayMaps>>
): Promise<T[]> {
  if (appointments.length === 0) {
    return appointments;
  }

  let calendarById: Awaited<ReturnType<typeof loadCalendarDisplayMaps>>['calendarById'];
  let dentistNameByDbUserId: Awaited<ReturnType<typeof loadCalendarDisplayMaps>>['dentistNameByDbUserId'];
  let dentistColorByCalendarAndUser: Awaited<ReturnType<typeof loadCalendarDisplayMaps>>['dentistColorByCalendarAndUser'];

  if (preloadedMaps) {
    ({ calendarById, dentistNameByDbUserId, dentistColorByCalendarAndUser } = preloadedMaps);
  } else {
    const db = await getMongoDbOrThrow();
    const calendarIds = appointments
      .map((appointment) => appointment.calendar_id)
      .filter((id): id is number => typeof id === 'number' && id > 0);
    ({ calendarById, dentistNameByDbUserId, dentistColorByCalendarAndUser } = await loadCalendarDisplayMaps(db, calendarIds));
  }

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
  const includeCancelled = query.includeCancelled === true;
  const search = query.search?.trim();

  const filter: Record<string, unknown> = {
    deleted_at: { $exists: false },
    // Exclude cancelled rows by default. Callers that want them
    // (the calendar right-side panel) pass `includeCancelled: true`.
    // When a specific `status` filter is set, the caller is asking
    // for that exact status and we respect it as-is.
    ...(status || includeCancelled ? {} : { status: { $ne: 'cancelled' } }),
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
      { category_label: regex },
      { notes: regex },
    ];
    filter.$or = searchOr;
  }

  // When calendar IDs are known upfront, prefetch display maps in parallel with
  // the appointments query — removes one sequential barrier from the hot path.
  const mapsPromise = hasCalendarScope
    ? loadCalendarDisplayMaps(db, calendarIds)
    : Promise.resolve(undefined);

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
      // Multi-service fields (new). Backward-compat: docs without service_ids
      // are treated as [service_id] in the hydration step below.
      service_ids: 1,
      service_names_snapshot: 1,
      prices_at_time: 1,
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
      category_label: 1,
      category_color: 1,
      color: 1,
      notes: 1,
      reminder_sent: 1,
      service_name: 1,
      price_at_time: 1,
      // Recurrence metadata: needed by the calendar card to show the loop
      // icon and by the edit form to populate the recurrence section
      // without a separate single-appointment fetch.
      recurrence: 1,
      recurrence_group_id: 1,
      created_at: 1,
      updated_at: 1,
    })
    .sort({ start_time: 1 })
    .toArray()
    .then((docs: any[]) => docs.map(stripMongoId));

  const appointmentServiceScopes = buildServiceScopesFromAppointments(appointments);
  // Collect every service id referenced across appointments. Each appointment
  // contributes either its `service_ids[]` array (new multi-service format) or
  // a single `service_id` (legacy single-service docs).
  const appointmentServiceIds = Array.from(
    new Set(
      appointments.flatMap((appointment: any): number[] => {
        if (Array.isArray(appointment.service_ids) && appointment.service_ids.length > 0) {
          return appointment.service_ids.filter(
            (id: unknown): id is number => typeof id === 'number'
          );
        }
        if (typeof appointment.service_id === 'number') return [appointment.service_id];
        return [];
      })
    )
  );
  const servicesFilter = buildServiceScopeFilter(appointmentServiceScopes);

  // Run services query and calendar maps fetch in parallel — both are independent
  // at this point: maps were prefetched from step 1, services filter is now ready.
  const [services, preloadedMaps] = await Promise.all([
    servicesFilter && appointmentServiceIds.length > 0
      ? db.collection('services').find({
          ...servicesFilter,
          id: { $in: appointmentServiceIds },
        }).project(SERVICES_PROJECTION).toArray().then((docs: any[]) => docs.map(stripMongoId))
      : Promise.resolve([]),
    mapsPromise,
  ]);

  const serviceById = new Map<number, any>(
    services.map((service: any) => [service.id, service])
  );

  const hydratedAppointments = appointments.map((appointment: any) => {
    // Normalize to the multi-service shape: if the doc only has the legacy
    // singular `service_id`, treat it as a 1-element array. The caller can
    // safely read `service_ids` / `service_names` arrays without checking.
    const ids: number[] =
      Array.isArray(appointment.service_ids) && appointment.service_ids.length > 0
        ? appointment.service_ids.filter(
            (id: unknown): id is number => typeof id === 'number'
          )
        : typeof appointment.service_id === 'number'
          ? [appointment.service_id]
          : [];

    const resolvedServices = ids.map((id) => serviceById.get(id)).filter(Boolean) as Array<{
      id: number;
      name: string;
      duration_minutes?: number;
      price?: number;
    }>;

    const serviceNames = resolvedServices.length > 0
      ? resolvedServices.map((s) => s.name)
      : Array.isArray(appointment.service_names_snapshot) && appointment.service_names_snapshot.length > 0
        ? (appointment.service_names_snapshot as string[])
        : appointment.service_name
          ? [appointment.service_name as string]
          : [];

    const totalDurationMinutes = resolvedServices.reduce(
      (sum, s) => sum + (typeof s.duration_minutes === 'number' ? s.duration_minutes : 0),
      0
    );

    const totalPrice =
      Array.isArray(appointment.prices_at_time) && appointment.prices_at_time.length > 0
        ? (appointment.prices_at_time as number[]).reduce(
            (sum, p) => sum + (typeof p === 'number' ? p : 0),
            0
          )
        : typeof appointment.price_at_time === 'number'
          ? appointment.price_at_time
          : resolvedServices.reduce(
              (sum, s) => sum + (typeof s.price === 'number' ? s.price : 0),
              0
            );

    return {
      ...appointment,
      // Keep legacy singular fields for back-compat with old client code.
      service_name: serviceNames[0] || '',
      // Multi-service fields exposed to the client.
      service_ids: ids,
      service_names: serviceNames,
      duration_minutes: totalDurationMinutes > 0 ? totalDurationMinutes : resolvedServices[0]?.duration_minutes,
      service_price: totalPrice,
    };
  });

  return attachCalendarDisplayData(hydratedAppointments, userId, preloadedMaps);
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
