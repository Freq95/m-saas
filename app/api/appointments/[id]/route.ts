import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, invalidateMongoCache, stripMongoId } from '@/lib/db/mongo-utils';
import { updateClientStats } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { checkAppointmentConflict } from '@/lib/calendar-conflicts';

const CONFLICT_MESSAGE_BY_TYPE: Record<string, string> = {
  provider_appointment: 'Providerul are deja o programare in acest interval.',
  resource_appointment: 'Resursa este deja ocupata in acest interval.',
  blocked_time: 'Intervalul este blocat.',
  outside_working_hours: 'Intervalul este in afara programului de lucru.',
};

function formatConflictPayload(conflict: any) {
  const baseMessage = CONFLICT_MESSAGE_BY_TYPE[conflict.type] || 'Conflict detectat.';
  if (conflict.type === 'blocked_time' && conflict.blockedTime?.reason) {
    return {
      type: conflict.type,
      message: `${baseMessage} Motiv: ${conflict.blockedTime.reason}.`,
    };
  }
  if ((conflict.type === 'provider_appointment' || conflict.type === 'resource_appointment') && conflict.appointment) {
    return {
      type: conflict.type,
      message: `${baseMessage} ${conflict.appointment.client_name || 'Client'} (${conflict.appointment.start_time} - ${conflict.appointment.end_time}).`,
    };
  }
  if (conflict.type === 'outside_working_hours' && conflict.workingHours) {
    return {
      type: conflict.type,
      message: `${baseMessage} Program: ${conflict.workingHours.start}-${conflict.workingHours.end}.`,
    };
  }
  return { type: conflict.type, message: baseMessage };
}

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

    if (Number.isNaN(appointmentId)) {
      return createErrorResponse('Invalid appointment ID', 400);
    }

    const { updateAppointmentSchema } = await import('@/lib/validation');
    const validationResult = updateAppointmentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.errors },
        { status: 400 }
      );
    }

    const {
      status,
      startTime,
      endTime,
      notes,
      serviceId,
      clientName,
      clientEmail,
      clientPhone,
      providerId,
      resourceId,
      category,
      color,
    } = validationResult.data;

    // Get existing appointment
    const existingAppointment = await db.collection('appointments').findOne({ id: appointmentId });
    if (!existingAppointment) {
      return createErrorResponse('Appointment not found', 404);
    }

    const updates: Record<string, unknown> = {};

    if (status !== undefined) {
      updates.status = status;
    }

    const hasTimeOrAllocationChange =
      startTime !== undefined ||
      endTime !== undefined ||
      providerId !== undefined ||
      resourceId !== undefined;

    // If times or assignment are being changed, check for conflicts
    if (hasTimeOrAllocationChange) {
      const newStartTime = startTime
        ? (typeof startTime === 'string' ? new Date(startTime) : startTime)
        : new Date(existingAppointment.start_time);

      const newEndTime = endTime
        ? (typeof endTime === 'string' ? new Date(endTime) : endTime)
        : new Date(existingAppointment.end_time);

      if (
        Number.isNaN(newStartTime.getTime()) ||
        Number.isNaN(newEndTime.getTime()) ||
        newStartTime >= newEndTime
      ) {
        return createErrorResponse('Invalid appointment time range', 400);
      }

      const targetProviderId =
        providerId === null
          ? null
          : (providerId !== undefined ? providerId : (existingAppointment.provider_id ?? null));
      const targetResourceId =
        resourceId === null
          ? null
          : (resourceId !== undefined ? resourceId : (existingAppointment.resource_id ?? null));

      // Check for conflicts (excluding this appointment)
      const conflictCheck = await checkAppointmentConflict(
        existingAppointment.user_id,
        targetProviderId || undefined,
        targetResourceId || undefined,
        newStartTime,
        newEndTime,
        appointmentId // Exclude current appointment from conflict check
      );

      if (conflictCheck.hasConflict) {
        return NextResponse.json(
          {
            error: 'Time slot conflicts with existing appointment or blocked time',
            conflicts: conflictCheck.conflicts.map(formatConflictPayload),
            suggestions: conflictCheck.suggestions.map((slot) => ({
              startTime: slot.start.toISOString(),
              endTime: slot.end.toISOString(),
              reason: 'Interval alternativ disponibil',
            })),
          },
          { status: 409 }
        );
      }

      if (startTime) {
        updates.start_time = newStartTime.toISOString();
      }
      if (endTime) {
        updates.end_time = newEndTime.toISOString();
      }
      if (providerId !== undefined) {
        updates.provider_id = targetProviderId;
      }
      if (resourceId !== undefined) {
        updates.resource_id = targetResourceId;
      }
    } else {
      if (providerId !== undefined) {
        updates.provider_id = providerId === null ? null : providerId;
      }
      if (resourceId !== undefined) {
        updates.resource_id = resourceId === null ? null : resourceId;
      }
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    if (serviceId !== undefined) {
      updates.service_id = serviceId;
    }

    const shouldUpdateClient =
      clientName !== undefined || clientEmail !== undefined || clientPhone !== undefined;

    if (shouldUpdateClient) {
      const normalizedName = (clientName ?? existingAppointment.client_name ?? '').trim();
      if (!normalizedName) {
        return createErrorResponse('Client name is required', 400);
      }

      const normalizedEmail = clientEmail !== undefined
        ? (clientEmail || null)
        : (existingAppointment.client_email || null);
      const normalizedPhone = clientPhone !== undefined
        ? (clientPhone || null)
        : (existingAppointment.client_phone || null);

      const { findOrCreateClient } = await import('@/lib/client-matching');
      const linkedClient = await findOrCreateClient(
        existingAppointment.user_id,
        normalizedName,
        normalizedEmail || undefined,
        normalizedPhone || undefined
      );

      updates.client_id = linkedClient.id;
      updates.client_name = normalizedName;
      updates.client_email = normalizedEmail;
      updates.client_phone = normalizedPhone;
    }

    if (category !== undefined) {
      updates.category = category || null;
    }

    if (color !== undefined) {
      updates.color = color || null;
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
