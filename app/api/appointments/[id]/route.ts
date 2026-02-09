import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, invalidateMongoCache, stripMongoId } from '@/lib/db/mongo-utils';
import { updateClientStats } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { checkAppointmentConflict } from '@/lib/calendar-conflicts';

// GET /api/appointments/[id] - Get single appointment
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const appointmentId = Number(params.id);

    if (Number.isNaN(appointmentId)) {
      return createErrorResponse('Invalid appointment ID', 400);
    }

    const appointmentDoc = await db.collection('appointments').findOne({ id: appointmentId });
    if (!appointmentDoc) {
      return createErrorResponse('Appointment not found', 404);
    }

    const [clientDoc, serviceDoc] = await Promise.all([
      appointmentDoc.client_id ? db.collection('clients').findOne({ id: appointmentDoc.client_id }) : null,
      appointmentDoc.service_id ? db.collection('services').findOne({ id: appointmentDoc.service_id }) : null,
    ]);

    const appointment = {
      ...stripMongoId(appointmentDoc),
      client_name: clientDoc?.name || appointmentDoc.client_name,
      client_email: clientDoc?.email || appointmentDoc.client_email,
      client_phone: clientDoc?.phone || appointmentDoc.client_phone,
      service_name: serviceDoc?.name || null,
    };

    return createSuccessResponse({ appointment });
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
    const db = await getMongoDbOrThrow();
    const appointmentId = Number(params.id);
    const body = await request.json();
    const { status, startTime, endTime, notes } = body;

    if (Number.isNaN(appointmentId)) {
      return createErrorResponse('Invalid appointment ID', 400);
    }

    // Get existing appointment
    const existingAppointment = await db.collection('appointments').findOne({ id: appointmentId });
    if (!existingAppointment) {
      return createErrorResponse('Appointment not found', 404);
    }

    const updates: Record<string, unknown> = {};

    if (status !== undefined) {
      updates.status = status;
    }

    // If times are being changed, check for conflicts
    if (startTime || endTime) {
      const newStartTime = startTime
        ? (typeof startTime === 'string' ? new Date(startTime) : startTime)
        : new Date(existingAppointment.start_time);

      const newEndTime = endTime
        ? (typeof endTime === 'string' ? new Date(endTime) : endTime)
        : new Date(existingAppointment.end_time);

      // Check for conflicts (excluding this appointment)
      const conflictCheck = await checkAppointmentConflict(
        existingAppointment.user_id,
        existingAppointment.provider_id,
        existingAppointment.resource_id,
        newStartTime,
        newEndTime,
        appointmentId // Exclude current appointment from conflict check
      );

      if (conflictCheck.hasConflict) {
        return createErrorResponse(
          'Time slot conflicts with existing appointment or blocked time',
          409,
          JSON.stringify({
            conflicts: conflictCheck.conflicts,
            suggestions: conflictCheck.suggestions,
          })
        );
      }

      if (startTime) {
        updates.start_time = newStartTime.toISOString();
      }
      if (endTime) {
        updates.end_time = newEndTime.toISOString();
      }
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    if (Object.keys(updates).length === 0) {
      return createErrorResponse('No fields to update', 400);
    }

    updates.updated_at = new Date().toISOString();

    await db.collection('appointments').updateOne(
      { id: appointmentId },
      { $set: updates }
    );

    const appointmentDoc = await db.collection('appointments').findOne({ id: appointmentId });
    if (!appointmentDoc) {
      return createErrorResponse('Appointment not found', 404);
    }

    // If status changed to 'completed', update client stats
    if (status === 'completed' && appointmentDoc.client_id) {
      await updateClientStats(appointmentDoc.client_id);
    }

    invalidateMongoCache();
    return createSuccessResponse({ appointment: stripMongoId(appointmentDoc) });
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
    const db = await getMongoDbOrThrow();
    const appointmentId = Number(params.id);

    if (Number.isNaN(appointmentId)) {
      return createErrorResponse('Invalid appointment ID', 400);
    }

    await db.collection('appointments').deleteOne({ id: appointmentId });

    invalidateMongoCache();
    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete appointment');
  }
}
