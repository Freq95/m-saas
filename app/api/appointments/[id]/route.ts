import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, invalidateMongoCache, stripMongoId } from '@/lib/db/mongo-utils';
import { updateClientStats } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

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

    const updates: Record<string, unknown> = {};

    if (status !== undefined) {
      updates.status = status;
    }

    if (startTime) {
      const startDate = typeof startTime === 'string' ? new Date(startTime) : startTime;
      updates.start_time = startDate.toISOString();
    }

    if (endTime) {
      const endDate = typeof endTime === 'string' ? new Date(endTime) : endTime;
      updates.end_time = endDate.toISOString();
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
