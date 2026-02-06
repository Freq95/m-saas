import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { z } from 'zod';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// Validation schema
const updateReminderSchema = z.object({
  status: z.enum(['pending', 'sent', 'failed']).optional(),
  channel: z.enum(['sms', 'whatsapp', 'email']).optional(),
  sentAt: z.string().datetime().optional(),
});

// GET /api/reminders/[id] - Get a specific reminder
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const reminderId = parseInt(params.id);

    // Validate ID
    if (isNaN(reminderId) || reminderId <= 0) {
      return createErrorResponse('Invalid reminder ID', 400);
    }

    const result = await db.query(
      `SELECT r.*, a.client_name, a.client_email, a.client_phone, a.start_time as appointment_time
       FROM reminders r
       LEFT JOIN appointments a ON r.appointment_id = a.id
       WHERE r.id = $1`,
      [reminderId]
    );

    if (result.rows.length === 0) {
      return createErrorResponse('Reminder not found', 404);
    }

    return createSuccessResponse({ reminder: result.rows[0] });
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
    const db = getDb();
    const reminderId = parseInt(params.id);
    const body = await request.json();

    // Validate input
    const validationResult = updateReminderSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    // Check if reminder exists
    const existingResult = await db.query(
      `SELECT * FROM reminders WHERE id = $1`,
      [reminderId]
    );

    if (existingResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Reminder not found' },
        { status: 404 }
      );
    }

    // Validate ID
    if (isNaN(reminderId) || reminderId <= 0) {
      return createErrorResponse('Invalid reminder ID', 400);
    }

    // Build update query
    const updates: string[] = [];
    const updateParams: (string | number | Date | null)[] = [];
    let paramIndex = 1;

    if (validationResult.data.status !== undefined) {
      updates.push(`status = $${paramIndex + 1}`);
      updateParams.push(validationResult.data.status);
      paramIndex++;
    }

    if (validationResult.data.channel !== undefined) {
      updates.push(`channel = $${paramIndex + 1}`);
      updateParams.push(validationResult.data.channel);
      paramIndex++;
    }

    if (validationResult.data.sentAt !== undefined) {
      updates.push(`sent_at = $${paramIndex + 1}`);
      updateParams.push(new Date(validationResult.data.sentAt));
      paramIndex++;
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      updateParams.push(reminderId);

      await db.query(
        `UPDATE reminders SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        updateParams
      );
    }

    // Fetch updated reminder
    const updatedResult = await db.query(
      `SELECT r.*, a.client_name, a.client_email, a.client_phone, a.start_time as appointment_time
       FROM reminders r
       LEFT JOIN appointments a ON r.appointment_id = a.id
       WHERE r.id = $1`,
      [reminderId]
    );

    return createSuccessResponse({
      success: true,
      reminder: updatedResult.rows[0],
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
    const db = getDb();
    const reminderId = parseInt(params.id);

    // Check if reminder exists
    const existingResult = await db.query(
      `SELECT * FROM reminders WHERE id = $1`,
      [reminderId]
    );

    // Validate ID
    if (isNaN(reminderId) || reminderId <= 0) {
      return createErrorResponse('Invalid reminder ID', 400);
    }

    if (existingResult.rows.length === 0) {
      return createErrorResponse('Reminder not found', 404);
    }

    await db.query(
      `DELETE FROM reminders WHERE id = $1`,
      [reminderId]
    );

    return createSuccessResponse({ success: true, message: 'Reminder deleted' });
  } catch (error) {
    return handleApiError(error, 'Failed to delete reminder');
  }
}

