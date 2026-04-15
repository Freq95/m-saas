import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { isSlotAvailable } from '@/lib/calendar';
import { AppointmentWriteBusyError, withAppointmentWriteLocks } from '@/lib/appointment-write-lock';
import { buildAppointmentDentistFields, resolveAppointmentDentistAssignment } from '@/lib/appointment-service';
import {
  getCalendarAuth,
  getOrCreateDefaultCalendar,
  requireCalendarPermission,
} from '@/lib/calendar-auth';
import { exportToGoogleCalendar } from '@/lib/google-calendar';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getAppointmentsData } from '@/lib/server/calendar';
import { getAuthUser } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { appointmentsListCacheKey, invalidateReadCaches } from '@/lib/cache-keys';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { logDataAccess } from '@/lib/audit';
import { getTenantTimeZone } from '@/lib/timezone';

// GET /api/appointments - Get appointments
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const { userId, dbUserId, tenantId, email, role } = auth;
    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters
    const { appointmentsQuerySchema } = await import('@/lib/validation');
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

    const cacheKey = appointmentsListCacheKey(
      { tenantId, userId },
      {
        calendarIds: calendarIds?.join(','),
        startDate,
        endDate,
        status,
        search,
      }
    );
    const payload = await getCached(cacheKey, 120, async () => {
      const appointments = await getAppointmentsData({
        userId,
        tenantId,
        calendarIds,
        startDate,
        endDate,
        status,
        search,
      });
      return { appointments };
    });

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
    const { createAppointmentSchema } = await import('@/lib/validation');
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
      clientName,
      clientEmail,
      clientPhone,
      forceNewClient,
      startTime,
      endTime,
      category,
      color,
      notes,
      exportToGoogle,
      googleAccessToken,
    } = validationResult.data;

    let targetCalendarId: number;
    let appointmentUserId: number;
    let appointmentTenantId = tenantId;
    let createdByUserId = dbUserId;

    if (typeof calendarId === 'number') {
      const calendarAuth = await getCalendarAuth(auth, calendarId);
      requireCalendarPermission(calendarAuth, 'can_create');
      targetCalendarId = calendarAuth.calendarId;
      appointmentUserId = calendarAuth.calendarOwnerId;
      appointmentTenantId = calendarAuth.calendarTenantId;
    } else {
      const defaultCalendar = await getOrCreateDefaultCalendar(auth);
      targetCalendarId = defaultCalendar.id;
      appointmentUserId = userId;
    }

    const dentistAssignment = await resolveAppointmentDentistAssignment(auth, targetCalendarId, dentistUserId);

    const serviceDoc = await db.collection('services').findOne({
      id: serviceId,
      user_id: dentistAssignment.serviceOwnerUserId,
      tenant_id: dentistAssignment.serviceOwnerTenantId,
      deleted_at: { $exists: false },
    });
    if (!serviceDoc) {
      return NextResponse.json(
        { error: 'Selected service was not found for the chosen dentist' },
        { status: 400 }
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

    const tenantTimeZone = await getTenantTimeZone(appointmentTenantId);
    const { findOrCreateClient, linkAppointmentToClient } = await import('@/lib/client-matching');

    const creationResult = await withAppointmentWriteLocks(
      {
        tenantId: appointmentTenantId,
        userId: appointmentUserId,
        calendarId: typeof calendarId === 'number' ? targetCalendarId : undefined,
        startTime: start,
        endTime: end,
        timeZone: tenantTimeZone,
      },
      async () => {
        const available = await isSlotAvailable(
          appointmentUserId,
          appointmentTenantId,
          start,
          end,
          {
            calendarId: typeof calendarId === 'number' ? targetCalendarId : undefined,
          }
        );
        if (!available) {
          return null;
        }

        const client = await findOrCreateClient(
          appointmentUserId,
          appointmentTenantId,
          clientName,
          clientEmail,
          clientPhone,
          forceNewClient ?? false
        );

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
          client_name: clientName,
          client_email: clientEmail || null,
          client_phone: clientPhone || null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          status: 'scheduled',
          category: category || null,
          color: color || null,
          notes: notes || null,
          price_at_time: typeof serviceDoc.price === 'number' ? serviceDoc.price : null,
          reminder_sent: false,
          created_at: now,
          updated_at: now,
        };

        await db.collection<FlexDoc>('appointments').insertOne(appointmentDoc);

        return {
          appointmentDoc,
          clientId: client.id,
        };
      }
    );

    if (!creationResult) {
      return NextResponse.json(
        { error: 'Time slot is not available' },
        { status: 400 }
      );
    }

    // Link appointment to client and update stats
    await linkAppointmentToClient(creationResult.appointmentDoc.id, creationResult.clientId, appointmentTenantId);
    await invalidateReadCaches({
      tenantId: appointmentTenantId,
      userId: appointmentUserId,
      calendarId: targetCalendarId,
    });

    const appointment = stripMongoId(creationResult.appointmentDoc) as any;

    // Export to Google Calendar if requested for the actor's own calendar context.
    if (exportToGoogle && googleAccessToken && appointmentUserId === userId && appointmentTenantId.equals(tenantId)) {
      try {
        const eventId = await exportToGoogleCalendar(
          Number(userId),
          appointment.id,
          googleAccessToken
        );
        if (eventId) {
          appointment.googleCalendarEventId = eventId;
        }
      } catch (error) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to export to Google Calendar', {
          error: error instanceof Error ? error.message : String(error),
          appointmentId: appointment.id,
        });
        // Don't fail the appointment creation if Google export fails
      }
    }
    return createSuccessResponse({ appointment }, 201);
  } catch (error) {
    if (error instanceof AppointmentWriteBusyError) {
      return NextResponse.json(
        { error: 'Another booking is being created for this slot. Please try again.' },
        { status: 409 }
      );
    }
    return handleApiError(error, 'Failed to create appointment');
  }
}
