import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { buildAppointmentDentistFields, resolveAppointmentDentistAssignment } from '@/lib/appointment-service';
import { checkAppointmentConflict } from '@/lib/calendar-conflicts';
import {
  formatAppointmentConflictPayload,
  formatAppointmentConflictSuggestions,
  getAppointmentConflictWarning,
  hasAvailabilityBlockConflict,
} from '@/lib/appointment-conflict-response';
import {
  getCalendarAuth,
  getOrCreateDefaultCalendar,
  requireCalendarPermission,
} from '@/lib/calendar-auth';
import { exportToGoogleCalendar } from '@/lib/google-calendar';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { attachCalendarDisplayData, getAppointmentsData } from '@/lib/server/calendar';
import { getAuthUser } from '@/lib/auth-helpers';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { logDataAccess } from '@/lib/audit';
import { appointmentsQuerySchema, createAppointmentSchema } from '@/lib/validation';
import { linkAppointmentToClient } from '@/lib/client-matching';
import { logger } from '@/lib/logger';
import {
  getAppointmentCategoriesForDentist,
  resolveAppointmentCategoryForWrite,
} from '@/lib/server/appointment-categories';
import { ExplicitClientSelectionError, resolveAppointmentClientLink } from './client-linking';

// GET /api/appointments - Get appointments
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const { userId, dbUserId, tenantId, email, role } = auth;
    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters
    const queryParams = {
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      calendarIds: searchParams.get('calendarIds') || undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || undefined,
    };

    const validationResult = appointmentsQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }

    const {
      startDate,
      endDate,
      calendarIds: parsedCalendarIds,
      status,
      search,
    } = validationResult.data;

    const calendarIds = parsedCalendarIds
      ? Array.from(new Set(parsedCalendarIds)).sort((a, b) => a - b)
      : undefined;

    if (calendarIds && calendarIds.length > 0) {
      await Promise.all(calendarIds.map((calendarId) => getCalendarAuth(auth, calendarId)));
    }

    // No cache layer for the appointments list: this endpoint is write-heavy
    // (every drag-drop, status change, create and delete invalidates it within
    // seconds) and Vercel's unstable_cache + revalidateTag has eventual
    // consistency. When the cache returned a stale payload after a write, the
    // SWR client would override the freshly-rendered SSR data, causing the
    // "first refresh shows old, second refresh shows correct" bug.
    //
    // The query path uses the (user_id, tenant_id, deleted_at, start_time)
    // perf index, so a single MongoDB round-trip is ~50-100ms — well within
    // budget for a per-user calendar view.
    const appointments = await getAppointmentsData({
      userId,
      tenantId,
      calendarIds,
      startDate,
      endDate,
      status,
      search,
    });
    const payload = { appointments };

    await logDataAccess({
      actorUserId: dbUserId,
      actorEmail: email,
      actorRole: role,
      tenantId,
      targetType: 'appointment.collection',
      route: '/api/appointments',
      request,
      metadata: {
        startDate: startDate || null,
        endDate: endDate || null,
        calendarIds: calendarIds || null,
        status: status || null,
        search: search || null,
      },
    });

    return createSuccessResponse(payload);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch appointments');
  }
}

// POST /api/appointments - Create appointment
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const { userId, dbUserId, tenantId } = auth;
    const limited = await checkWriteRateLimit(userId);
    if (limited) return limited;
    const db = await getMongoDbOrThrow();
    const body = await request.json();

    // Validate input
    const validationResult = createAppointmentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const {
      conversationId,
      calendarId,
      dentistUserId,
      serviceId,
      clientId,
      clientName,
      clientEmail,
      clientPhone,
      forceNewClient,
      startTime,
      endTime,
      category,
      categoryId,
      color,
      notes,
      exportToGoogle,
      googleAccessToken,
    } = validationResult.data;

    let targetCalendarId: number;
    let appointmentUserId: number;
    let appointmentTenantId = tenantId;
    const createdByUserId = dbUserId;
    let isSharedCalendar = false;

    if (typeof calendarId === 'number') {
      const calendarAuth = await getCalendarAuth(auth, calendarId);
      requireCalendarPermission(calendarAuth, 'can_create');
      targetCalendarId = calendarAuth.calendarId;
      appointmentUserId = calendarAuth.calendarOwnerId;
      appointmentTenantId = calendarAuth.calendarTenantId;
      isSharedCalendar = !calendarAuth.isOwner;
    } else {
      const defaultCalendar = await getOrCreateDefaultCalendar(auth);
      targetCalendarId = defaultCalendar.id;
      appointmentUserId = userId;
    }

    const dentistAssignment = await resolveAppointmentDentistAssignment(auth, targetCalendarId, dentistUserId);

    // Services belong to the assigned dentist's catalog.
    const serviceDoc = await db.collection('services').findOne({
      id: serviceId,
      user_id: dentistAssignment.assignedDentistUserId,
      tenant_id: dentistAssignment.assignedDentistTenantId,
      deleted_at: { $exists: false },
    });
    if (!serviceDoc) {
      return NextResponse.json(
        { error: 'Selected service was not found for the chosen dentist' },
        { status: 400 }
      );
    }

    // Only the dentist themselves can create new patients in their own account.
    if (!dentistAssignment.isCurrentUser && (typeof clientId !== 'number' || forceNewClient)) {
      return NextResponse.json(
        { error: 'Selecteaza un pacient existent. Pacientii pot fi adaugati doar de medicul selectat.' },
        { status: 403 }
      );
    }

    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;

    // Calculate end time if not provided
    let end: Date;
    if (endTime) {
      end = typeof endTime === 'string' ? new Date(endTime) : endTime;
    } else {
      const durationMinutes = serviceDoc.duration_minutes || 60;
      end = new Date(start);
      end.setMinutes(end.getMinutes() + durationMinutes);
    }

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return NextResponse.json(
        { error: 'Invalid appointment time range' },
        { status: 400 }
      );
    }

    const conflictCheck = await checkAppointmentConflict(
      appointmentUserId,
      appointmentTenantId,
      start,
      end,
      undefined,
      true,
      {
        calendarId: targetCalendarId,
        dentistUserId: dentistAssignment.assignedDentistUserId,
        dentistTenantId: dentistAssignment.assignedDentistTenantId,
      }
    );

    if (hasAvailabilityBlockConflict(conflictCheck.conflicts)) {
      return NextResponse.json(
        {
          error: 'Intervalul este blocat in calendar.',
          conflicts: conflictCheck.conflicts.map(formatAppointmentConflictPayload),
          suggestions: formatAppointmentConflictSuggestions(conflictCheck.suggestions),
        },
        { status: 409 }
      );
    }

    const client = await resolveAppointmentClientLink({
      db,
      userId: dentistAssignment.assignedDentistUserId,
      tenantId: dentistAssignment.assignedDentistTenantId,
      clientId,
      name: clientName,
      email: clientEmail || null,
      phone: clientPhone || null,
      forceNewClient: forceNewClient ?? false,
    });

    const calendarDoc = await db.collection('calendars').findOne(
      { id: targetCalendarId, tenant_id: appointmentTenantId },
      { projection: { is_default: 1 } }
    );
    const isDefaultPersonalCalendar = Boolean(calendarDoc?.is_default && !isSharedCalendar);
    const effectiveCategoryId =
      typeof categoryId === 'number'
        ? categoryId
        : !category && isDefaultPersonalCalendar
          ? (await getAppointmentCategoriesForDentist(
              dentistAssignment.assignedDentistUserId,
              dentistAssignment.assignedDentistTenantId
            ))[0]?.id
          : undefined;

    let resolvedCategory: Awaited<ReturnType<typeof resolveAppointmentCategoryForWrite>> = null;
    if (typeof effectiveCategoryId === 'number') {
      resolvedCategory = await resolveAppointmentCategoryForWrite({
        db,
        tenantId: dentistAssignment.assignedDentistTenantId,
        userId: dentistAssignment.assignedDentistUserId,
        categoryId: effectiveCategoryId,
      });
      if (!resolvedCategory) {
        return NextResponse.json(
          { error: 'Selected category was not found for the chosen dentist' },
          { status: 400 }
        );
      }
    }

    const now = new Date().toISOString();
    const appointmentId = await getNextNumericId('appointments');
    const appointmentDoc = {
      _id: appointmentId,
      id: appointmentId,
      tenant_id: appointmentTenantId,
      user_id: appointmentUserId,
      calendar_id: targetCalendarId,
      created_by_user_id: createdByUserId,
      ...buildAppointmentDentistFields(dentistAssignment),
      conversation_id: conversationId || null,
      service_id: serviceId,
      service_name: serviceDoc.name,
      client_id: client.id,
      client_name: client.name || clientName,
      client_email: client.email || clientEmail || null,
      client_phone: client.phone || clientPhone || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'scheduled',
      category: isDefaultPersonalCalendar ? (resolvedCategory?.key || category || null) : null,
      category_label: isDefaultPersonalCalendar ? (resolvedCategory?.label || null) : null,
      category_color: isDefaultPersonalCalendar ? (resolvedCategory?.color || null) : null,
      color: color || null,
      notes: notes || null,
      price_at_time: typeof serviceDoc.price === 'number' ? serviceDoc.price : null,
      reminder_sent: false,
      created_at: now,
      updated_at: now,
    };

    await db.collection<FlexDoc>('appointments').insertOne(appointmentDoc);

    // Link appointment to client and update stats
    await linkAppointmentToClient(
      appointmentDoc.id,
      client.id,
      appointmentTenantId,
      dentistAssignment.assignedDentistTenantId
    );
    await invalidateReadCaches({
      tenantId: appointmentTenantId,
      userId: appointmentUserId,
      calendarId: targetCalendarId,
    });

    const appointment = stripMongoId(appointmentDoc) as any;
    const [decoratedAppointment] = await attachCalendarDisplayData([appointment], userId);

    // Google Calendar export is fire-and-forget: the appointment is already saved
    // in our DB, so a slow Google API round-trip (often 200-500ms) shouldn't block
    // the response. If it fails or eventually returns, we log it but never surface
    // the eventId in the immediate response. Callers needing it can re-fetch.
    if (exportToGoogle && googleAccessToken && appointmentUserId === userId && appointmentTenantId.equals(tenantId)) {
      void exportToGoogleCalendar(Number(userId), appointment.id, googleAccessToken)
        .catch((error) => {
          logger.warn('Failed to export to Google Calendar', {
            error: error instanceof Error ? error.message : String(error),
            appointmentId: appointment.id,
          });
        });
    }
    const warning = getAppointmentConflictWarning(conflictCheck.conflicts);
    return createSuccessResponse(
      {
        appointment: decoratedAppointment || appointment,
        warning,
        conflicts: conflictCheck.conflicts.map(formatAppointmentConflictPayload),
        suggestions: formatAppointmentConflictSuggestions(conflictCheck.suggestions),
      },
      201
    );
  } catch (error) {
    if (error instanceof ExplicitClientSelectionError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }
    return handleApiError(error, 'Failed to create appointment');
  }
}
