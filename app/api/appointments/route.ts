import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId } from '@/lib/db/mongo-utils';
import { isSlotAvailable } from '@/lib/calendar';
import { exportToGoogleCalendar } from '@/lib/google-calendar';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getAppointmentsData } from '@/lib/server/calendar';
import { getAuthUser } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { appointmentsListCacheKey, invalidateReadCaches } from '@/lib/cache-keys';

// GET /api/appointments - Get appointments
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters
    const { appointmentsQuerySchema } = await import('@/lib/validation');
    const queryParams = {
      userId: String(userId),
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      providerId: searchParams.get('providerId') || undefined,
      resourceId: searchParams.get('resourceId') || undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || undefined,
    };

    const validationResult = appointmentsQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }

    const { startDate, endDate, providerId, resourceId, status, search } = validationResult.data;
    const cacheKey = appointmentsListCacheKey(
      { tenantId, userId },
      { startDate, endDate, providerId, resourceId, status, search }
    );
    const payload = await getCached(cacheKey, 120, async () => {
      const appointments = await getAppointmentsData({
        userId,
        tenantId,
        startDate,
        endDate,
        providerId,
        resourceId,
        status,
        search,
      });
      return { appointments };
    });

    return createSuccessResponse(payload);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch appointments');
  }
}

// POST /api/appointments - Create appointment
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
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
      serviceId,
      clientName,
      clientEmail,
      clientPhone,
      startTime,
      endTime,
      providerId,
      resourceId,
      category,
      color,
      notes,
      exportToGoogle,
      googleAccessToken,
    } = validationResult.data;

    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;

    // Calculate end time if not provided
    let end: Date;
    if (endTime) {
      end = typeof endTime === 'string' ? new Date(endTime) : endTime;
    } else {
      const serviceDoc = await db.collection('services').findOne({ id: serviceId, user_id: userId, tenant_id: tenantId });
      const durationMinutes = serviceDoc?.duration_minutes || 60;
      end = new Date(start);
      end.setMinutes(end.getMinutes() + durationMinutes);
    }

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return NextResponse.json(
        { error: 'Invalid appointment time range' },
        { status: 400 }
      );
    }

    // Check if slot is available
    const available = await isSlotAvailable(Number(userId), tenantId, start, end, {
      providerId,
      resourceId,
    });
    if (!available) {
      return NextResponse.json(
        { error: 'Time slot is not available' },
        { status: 400 }
      );
    }

    // Find or create client
    const { findOrCreateClient, linkAppointmentToClient } = await import('@/lib/client-matching');
    const client = await findOrCreateClient(
      userId,
      tenantId,
      clientName,
      clientEmail,
      clientPhone
    );

    const now = new Date().toISOString();
    const appointmentId = await getNextNumericId('appointments');
    const appointmentDoc = {
      _id: appointmentId,
      id: appointmentId,
      tenant_id: tenantId,
      user_id: userId,
      conversation_id: conversationId || null,
      service_id: serviceId,
      client_id: client.id,
      client_name: clientName,
      client_email: clientEmail || null,
      client_phone: clientPhone || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'scheduled',
      provider_id: providerId || null,
      resource_id: resourceId || null,
      category: category || null,
      color: color || null,
      notes: notes || null,
      reminder_sent: false,
      created_at: now,
      updated_at: now,
    };

    await db.collection('appointments').insertOne(appointmentDoc);

    // Link appointment to client and update stats
    await linkAppointmentToClient(appointmentId, client.id, tenantId);
    await invalidateReadCaches({ tenantId, userId });

    const appointment = stripMongoId(appointmentDoc) as any;

    // Export to Google Calendar if requested
    if (exportToGoogle && googleAccessToken) {
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
        logger.warn('Failed to export to Google Calendar', { error: error instanceof Error ? error.message : String(error), appointmentId: appointment.id });
        // Don't fail the appointment creation if Google export fails
      }
    }
    return createSuccessResponse({ appointment }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create appointment');
  }
}
