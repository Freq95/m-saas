import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMongoDbOrThrow, getNextNumericId, invalidateMongoCache, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';

// Validation schemas
const createReminderSchema = z.object({
  appointmentId: z.number().int().positive(),
  channel: z.enum(['sms', 'whatsapp', 'email']),
  message: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
});

// GET /api/reminders - Get all reminders
export async function GET(request: NextRequest) {
  try {
    const db = await getMongoDbOrThrow();
    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters
    const { remindersQuerySchema } = await import('@/lib/validation');
    const queryParams = {
      userId: searchParams.get('userId') || '1',
      status: searchParams.get('status') || undefined,
    };

    const validationResult = remindersQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }

    const { userId, status } = validationResult.data;
    const appointmentId = searchParams.get('appointmentId');
    const channel = searchParams.get('channel');

    const appointmentFilter: Record<string, any> = { user_id: userId };
    if (appointmentId) appointmentFilter.id = parseInt(appointmentId);

    const appointments = await db.collection('appointments').find(appointmentFilter).toArray();
    const appointmentIds = appointments.map((a: any) => a.id);

    if (appointmentIds.length === 0) {
      return createSuccessResponse({ reminders: [], count: 0 });
    }

    const reminderFilter: Record<string, any> = {
      appointment_id: { $in: appointmentIds },
    };
    if (status) reminderFilter.status = status;
    if (channel) reminderFilter.channel = channel;

    const reminders = await db
      .collection('reminders')
      .find(reminderFilter)
      .sort({ created_at: -1 })
      .toArray();

    const apptMap = new Map<number, any>(appointments.map((a: any) => [a.id, a]));
    const enriched = reminders.map((r: any) => {
      const appointment = apptMap.get(r.appointment_id);
      return {
        ...stripMongoId(r),
        client_name: appointment?.client_name || null,
        client_email: appointment?.client_email || null,
        client_phone: appointment?.client_phone || null,
        appointment_time: appointment?.start_time || null,
      };
    });

    return createSuccessResponse({
      reminders: enriched,
      count: enriched.length,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch reminders');
  }
}

// POST /api/reminders - Create a new reminder
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDbOrThrow();
    const body = await request.json();

    // Validate input
    const validationResult = createReminderSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { appointmentId, channel, message, scheduledAt } = validationResult.data;

    // Verify appointment exists
    const appointment = await db.collection('appointments').findOne({ id: appointmentId });

    if (!appointment) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Create reminder
    const now = new Date().toISOString();
    const reminderId = await getNextNumericId('reminders');
    const reminderDoc = {
      _id: reminderId,
      id: reminderId,
      appointment_id: appointmentId,
      channel,
      message: message || null,
      status: 'pending',
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      sent_at: null,
      created_at: now,
      updated_at: now,
    };

    await db.collection('reminders').insertOne(reminderDoc);
    invalidateMongoCache();

    return createSuccessResponse({
      reminder: stripMongoId(reminderDoc),
      success: true,
    }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create reminder');
  }
}
