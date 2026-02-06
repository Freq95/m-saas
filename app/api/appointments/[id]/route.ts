import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { updateClientStats } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// GET /api/appointments/[id] - Get single appointment
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const appointmentId = params.id;

    const result = await db.query(
      `SELECT a.*, 
              c.name as client_name, 
              c.email as client_email, 
              c.phone as client_phone,
              s.name as service_name 
       FROM appointments a
       LEFT JOIN clients c ON a.client_id = c.id
       LEFT JOIN services s ON a.service_id = s.id
       WHERE a.id = $1`,
      [appointmentId]
    );

    if (result.rows.length === 0) {
      return createErrorResponse('Appointment not found', 404);
    }

    return createSuccessResponse({ appointment: result.rows[0] });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch appointment');
  }
}

// PATCH /api/appointments/[id] - Update appointment
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const appointmentId = params.id;
    const body = await request.json();
    const { status, startTime, endTime, notes } = body;

    const updates: string[] = [];
    const values: (string | number | Date | null)[] = [];
    let paramIndex = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }

    if (startTime) {
      updates.push(`start_time = $${paramIndex++}`);
      values.push(new Date(startTime));
    }

    if (endTime) {
      updates.push(`end_time = $${paramIndex++}`);
      values.push(new Date(endTime));
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }

    if (updates.length === 0) {
      return createErrorResponse('No fields to update', 400);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(appointmentId);

    const query = `
      UPDATE appointments 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await db.query(query, values);
    const appointment = result.rows[0];

    // If status changed to 'completed', update client stats
    if (status === 'completed' && appointment.client_id) {
      await updateClientStats(appointment.client_id);
    }

    return createSuccessResponse({ appointment });
  } catch (error) {
    return handleApiError(error, 'Failed to update appointment');
  }
}

// DELETE /api/appointments/[id] - Delete appointment
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const appointmentId = params.id;

    await db.query('DELETE FROM appointments WHERE id = $1', [appointmentId]);

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete appointment');
  }
}

