import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// Validation schema
const updateReminderSchema = z.object({
  status: z.enum(['pending', 'sent', 'failed']).optional(),
  channel: z.enum(['sms', 'whatsapp', 'email']).optional(),
  sentAt: z.string().datetime().optional(),
});

async function getReminderWithAppointment(reminderId: number, userId?: number) {
  const db = await getMongoDbOrThrow();
  const reminderFilter: Record<string, unknown> = { id: reminderId };
  if (typeof userId === 'number') {
    reminderFilter.user_id = userId;
  }
  const reminder = await db.collection('reminders').findOne(reminderFilter);
  if (!reminder) return null;
  const appointment = await db.collection('appointments').findOne({
    id: reminder.appointment_id,
    user_id: reminder.user_id,
  });
  return {
    ...stripMongoId(reminder),
    client_name: appointment?.client_name || null,
    client_email: appointment?.client_email || null,
    client_phone: appointment?.client_phone || null,
    appointment_time: appointment?.start_time || null,
  };
}

// GET /api/reminders/[id] - Get a specific reminder
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reminderId = parseInt(params.id);

    // Validate ID
    if (isNaN(reminderId) || reminderId <= 0) {
      return createErrorResponse('Invalid reminder ID', 400);
    }

    const reminder = await getReminderWithAppointment(reminderId);
    if (!reminder) {
      return createErrorResponse('Reminder not found', 404);
    }

    return createSuccessResponse({ reminder });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch reminder');
  }
}

// PATCH /api/reminders/[id] - Update a reminder
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const reminderId = parseInt(params.id);
    const { DEFAULT_USER_ID } = await import('@/lib/constants');
    const userId = parseInt(request.nextUrl.searchParams.get('userId') || DEFAULT_USER_ID.toString(), 10);
    const body = await request.json();

    // Validate input
    const validationResult = updateReminderSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    // Validate ID
    if (isNaN(reminderId) || reminderId <= 0) {
      return createErrorResponse('Invalid reminder ID', 400);
    }

    // Check if reminder exists
    const existing = await db.collection('reminders').findOne({ id: reminderId, user_id: userId });
    if (!existing) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const updates: Record<string, any> = {};
    if (validationResult.data.status !== undefined) updates.status = validationResult.data.status;
    if (validationResult.data.channel !== undefined) updates.channel = validationResult.data.channel;
    if (validationResult.data.sentAt !== undefined) updates.sent_at = new Date(validationResult.data.sentAt).toISOString();

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const result = await db.collection('reminders').updateOne(
        { id: reminderId, user_id: userId },
        { $set: updates }
      );
      if (result.matchedCount === 0) {
        return createErrorResponse('Not found or not authorized', 404);
      }
    }

    const reminder = await getReminderWithAppointment(reminderId, userId);

    return createSuccessResponse({
      success: true,
      reminder,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to update reminder');
  }
}

// DELETE /api/reminders/[id] - Delete a reminder
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const reminderId = parseInt(params.id);
    const { DEFAULT_USER_ID } = await import('@/lib/constants');
    const userId = parseInt(request.nextUrl.searchParams.get('userId') || DEFAULT_USER_ID.toString(), 10);

    // Validate ID
    if (isNaN(reminderId) || reminderId <= 0) {
      return createErrorResponse('Invalid reminder ID', 400);
    }

    const existing = await db.collection('reminders').findOne({ id: reminderId, user_id: userId });
    if (!existing) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const result = await db.collection('reminders').deleteOne({ id: reminderId, user_id: userId });
    if (result.deletedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    return createSuccessResponse({ success: true, message: 'Reminder deleted' });
  } catch (error) {
    return handleApiError(error, 'Failed to delete reminder');
  }
}
