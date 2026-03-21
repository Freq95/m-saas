import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId } from '@/lib/db/mongo-utils';
import { updateClientStats } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { checkAppointmentConflict } from '@/lib/calendar-conflicts';
import { getAuthUser } from '@/lib/auth-helpers';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { logger } from '@/lib/logger';
import { generateRecurringInstances } from '@/lib/recurring-utils';

const CONFLICT_MESSAGE_BY_TYPE: Record<string, string> = {
  provider_appointment: 'Providerul are deja o programare in acest interval.',
  resource_appointment: 'Resursa este deja ocupata in acest interval.',
  appointment_overlap: 'Exista deja o alta programare in acest interval.',
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
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const appointmentId = Number(params.id);

    if (Number.isNaN(appointmentId)) {
      return createErrorResponse('Invalid appointment ID', 400);
    }

    const appointmentDoc = await db.collection('appointments').findOne({
      id: appointmentId,
      user_id: userId,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    });
    if (!appointmentDoc) {
      return createErrorResponse('Appointment not found', 404);
    }

    const [clientDoc, serviceDoc] = await Promise.all([
      appointmentDoc.client_id ? db.collection('clients').findOne({ id: appointmentDoc.client_id, tenant_id: tenantId }) : null,
      appointmentDoc.service_id ? db.collection('services').findOne({ id: appointmentDoc.service_id, tenant_id: tenantId }) : null,
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
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId, tenantId } = await getAuthUser();
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
      isRecurring,
      recurrence,
    } = validationResult.data;

    // Get existing appointment
    const existingAppointment = await db.collection('appointments').findOne({
      id: appointmentId,
      user_id: userId,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    });
    if (!existingAppointment) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const updates: Record<string, unknown> = {};
    const shouldCreateRecurringInstances =
      isRecurring === true &&
      recurrence !== undefined &&
      !existingAppointment.recurrence_group_id;

    if (status !== undefined) {
      updates.status = status;
    }

    const WARN_TRANSITIONS: Record<string, string[]> = {
      cancelled: ['completed'],
      'no-show': ['completed'],
    };
    const STATUS_LABELS: Record<string, string> = {
      scheduled: 'Programat',
      completed: 'Finalizat',
      cancelled: 'Anulat',
      'no-show': 'Absent',
    };
    const currentStatus = existingAppointment.status === 'no_show'
      ? 'no-show'
      : String(existingAppointment.status || 'scheduled');
    const warning = status && WARN_TRANSITIONS[currentStatus]?.includes(status)
      ? `Statusul a fost schimbat din "${STATUS_LABELS[currentStatus] ?? currentStatus}" în "${STATUS_LABELS[status] ?? status}".`
      : null;

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
        tenantId,
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
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    if (serviceId !== undefined) {
      const serviceDoc = await db.collection('services').findOne({
        id: serviceId,
        user_id: existingAppointment.user_id,
        tenant_id: tenantId,
      });
      if (!serviceDoc) {
        return createErrorResponse('Service not found', 400);
      }
      updates.service_id = serviceId;
      updates.price_at_time = typeof serviceDoc.price === 'number' ? serviceDoc.price : null;
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
        tenantId,
        normalizedName,
        normalizedEmail || undefined,
        normalizedPhone || undefined,
        false,
        true
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

    if (isRecurring === false) {
      updates.recurrence = null;
      updates.recurrence_group_id = null;
    } else if ((isRecurring === true || recurrence) && recurrence) {
      updates.recurrence = {
        frequency: recurrence.frequency,
        interval: Math.max(1, Number(recurrence.interval) || 1),
        end_date: recurrence.end_date || recurrence.endDate,
        count: recurrence.count,
      };
      updates.recurrence_group_id = existingAppointment.recurrence_group_id
        || await getNextNumericId('recurrence_groups');
    }

    if (Object.keys(updates).length === 0) {
      return createErrorResponse('No fields to update', 400);
    }

    updates.updated_at = new Date().toISOString();

    const previousClientId = typeof existingAppointment.client_id === 'number' ? existingAppointment.client_id : null;
    const updateResult = await db.collection('appointments').updateOne(
      { id: appointmentId, user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } },
      { $set: updates }
    );
    if (updateResult.matchedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const appointmentDoc = await db.collection('appointments').findOne({
      id: appointmentId,
      user_id: userId,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    });
    if (!appointmentDoc) {
      return createErrorResponse('Appointment not found', 404);
    }

    const shouldSyncRecurringSeriesFromAnchor =
      !shouldCreateRecurringInstances &&
      appointmentDoc.recurrence &&
      appointmentDoc.recurrence_group_id &&
      (isRecurring !== undefined || recurrence !== undefined);

    if (
      shouldCreateRecurringInstances &&
      appointmentDoc.recurrence &&
      appointmentDoc.recurrence_group_id
    ) {
      const recurrenceRule = appointmentDoc.recurrence;
      const recurringInstances = generateRecurringInstances(
        new Date(appointmentDoc.start_time),
        new Date(appointmentDoc.end_time),
        recurrenceRule
      );

      for (const instance of recurringInstances) {
        const conflictCheck = await checkAppointmentConflict(
          appointmentDoc.user_id,
          tenantId,
          appointmentDoc.provider_id || undefined,
          appointmentDoc.resource_id || undefined,
          instance.start,
          instance.end
        );
        if (conflictCheck.hasConflict) {
          continue;
        }

        const nextRecurringId = await getNextNumericId('appointments');
        const nowIso = new Date().toISOString();
        await db.collection('appointments').insertOne({
          id: nextRecurringId,
          _id: nextRecurringId,
          tenant_id: tenantId,
          user_id: appointmentDoc.user_id,
          conversation_id: appointmentDoc.conversation_id || null,
          service_id: appointmentDoc.service_id,
          service_name: appointmentDoc.service_name || null,
          client_id: appointmentDoc.client_id || null,
          client_name: appointmentDoc.client_name || null,
          client_email: appointmentDoc.client_email || null,
          client_phone: appointmentDoc.client_phone || null,
          start_time: instance.start.toISOString(),
          end_time: instance.end.toISOString(),
          status: 'scheduled',
          provider_id: appointmentDoc.provider_id || null,
          resource_id: appointmentDoc.resource_id || null,
          category: appointmentDoc.category || null,
          color: appointmentDoc.color || null,
          notes: appointmentDoc.notes || null,
          price_at_time: appointmentDoc.price_at_time ?? null,
          recurrence: recurrenceRule,
          recurrence_group_id: appointmentDoc.recurrence_group_id,
          reminder_sent: false,
          created_at: nowIso,
          updated_at: nowIso,
        });
      }
    }

    else if (shouldSyncRecurringSeriesFromAnchor) {
      await syncRecurringSeriesFromAnchor({
        db,
        tenantId,
        anchorAppointment: appointmentDoc,
      });
    }

    const impactedClientIds = new Set<number>();
    if (previousClientId !== null) {
      impactedClientIds.add(previousClientId);
    }
    if (typeof appointmentDoc.client_id === 'number') {
      impactedClientIds.add(appointmentDoc.client_id);
    }
    if (
      impactedClientIds.size > 0 &&
      (
        previousClientId !== appointmentDoc.client_id ||
        status !== undefined ||
        serviceId !== undefined ||
        startTime !== undefined ||
        endTime !== undefined ||
        clientName !== undefined ||
        clientEmail !== undefined ||
        clientPhone !== undefined ||
        isRecurring !== undefined ||
        recurrence !== undefined
      )
    ) {
      await Promise.all(Array.from(impactedClientIds).map((clientId) => updateClientStats(clientId, tenantId)));
    }
    await invalidateReadCaches({ tenantId, userId });
    return createSuccessResponse({ appointment: stripMongoId(appointmentDoc), warning });
  } catch (error) {
    return handleApiError(error, 'Failed to update appointment');
  }
}

async function syncRecurringSeriesFromAnchor({
  db,
  tenantId,
  anchorAppointment,
}: {
  db: any;
  tenantId: any;
  anchorAppointment: any;
}): Promise<void> {
  if (!anchorAppointment.recurrence || !anchorAppointment.recurrence_group_id) {
    return;
  }

  const anchorStart = new Date(anchorAppointment.start_time);
  const anchorEnd = new Date(anchorAppointment.end_time);
  if (Number.isNaN(anchorStart.getTime()) || Number.isNaN(anchorEnd.getTime()) || anchorStart >= anchorEnd) {
    logger.error('syncRecurringSeriesFromAnchor: invalid anchor time range, skipping series sync', {
      appointmentId: anchorAppointment.id,
      start_time: anchorAppointment.start_time,
      end_time: anchorAppointment.end_time,
    });
    return;
  }

  const futureInstances = generateRecurringInstances(anchorStart, anchorEnd, anchorAppointment.recurrence);
  const desiredInstances = futureInstances.map((instance) => ({
    start: instance.start,
    end: instance.end,
    key: `${instance.start.toISOString()}|${instance.end.toISOString()}`,
  }));
  const desiredKeys = new Set(desiredInstances.map((item) => item.key));

  const existingSeriesAppointments = await db.collection('appointments').find({
    tenant_id: tenantId,
    user_id: anchorAppointment.user_id,
    recurrence_group_id: anchorAppointment.recurrence_group_id,
    deleted_at: { $exists: false },
    id: { $ne: anchorAppointment.id },
  }).toArray();

  const existingByKey = new Map<string, any>();
  const toDeleteIds: number[] = [];
  const toUpdateIds: number[] = [];
  const toInsertDocs: any[] = [];

  for (const appointment of existingSeriesAppointments) {
    if (appointment.status !== 'scheduled') {
      continue;
    }
    const normalizedStart = new Date(appointment.start_time);
    const normalizedEnd = new Date(appointment.end_time);
    if (Number.isNaN(normalizedStart.getTime()) || Number.isNaN(normalizedEnd.getTime())) {
      logger.warn('syncRecurringSeriesFromAnchor: invalid recurring instance date, skipping key matching', {
        appointmentId: appointment.id,
        recurrenceGroupId: anchorAppointment.recurrence_group_id,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
      });
      continue;
    }
    if (normalizedStart < anchorStart) {
      continue;
    }
    const key = `${normalizedStart.toISOString()}|${normalizedEnd.toISOString()}`;
    if (desiredKeys.has(key)) {
      existingByKey.set(key, appointment);
      toUpdateIds.push(appointment.id);
    } else {
      toDeleteIds.push(appointment.id);
    }
  }

  for (const desired of desiredInstances) {
    if (existingByKey.has(desired.key)) {
      continue;
    }

    const conflictCheck = await checkAppointmentConflict(
      anchorAppointment.user_id,
      tenantId,
      anchorAppointment.provider_id || undefined,
      anchorAppointment.resource_id || undefined,
      desired.start,
      desired.end
    );
    if (conflictCheck.hasConflict) {
      continue;
    }

    const nextRecurringId = await getNextNumericId('appointments');
    const nowIso = new Date().toISOString();
    toInsertDocs.push({
      id: nextRecurringId,
      _id: nextRecurringId,
      tenant_id: tenantId,
      user_id: anchorAppointment.user_id,
      conversation_id: anchorAppointment.conversation_id || null,
      service_id: anchorAppointment.service_id,
      service_name: anchorAppointment.service_name || null,
      client_id: anchorAppointment.client_id || null,
      client_name: anchorAppointment.client_name || null,
      client_email: anchorAppointment.client_email || null,
      client_phone: anchorAppointment.client_phone || null,
      start_time: desired.start.toISOString(),
      end_time: desired.end.toISOString(),
      status: 'scheduled',
      provider_id: anchorAppointment.provider_id || null,
      resource_id: anchorAppointment.resource_id || null,
      category: anchorAppointment.category || null,
      color: anchorAppointment.color || null,
      notes: anchorAppointment.notes || null,
      price_at_time: anchorAppointment.price_at_time ?? null,
      recurrence: anchorAppointment.recurrence,
      recurrence_group_id: anchorAppointment.recurrence_group_id,
      reminder_sent: false,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      if (toDeleteIds.length > 0) {
        const nowIso = new Date().toISOString();
        await db.collection('appointments').updateMany(
          { id: { $in: toDeleteIds }, tenant_id: tenantId, deleted_at: { $exists: false } },
          { $set: { deleted_at: nowIso, updated_at: nowIso } },
          { session }
        );
      }

      if (toUpdateIds.length > 0) {
        await db.collection('appointments').updateMany(
          { id: { $in: toUpdateIds }, tenant_id: tenantId, deleted_at: { $exists: false } },
          {
            $set: {
              service_id: anchorAppointment.service_id,
              service_name: anchorAppointment.service_name || null,
              client_id: anchorAppointment.client_id || null,
              client_name: anchorAppointment.client_name || null,
              client_email: anchorAppointment.client_email || null,
              client_phone: anchorAppointment.client_phone || null,
              provider_id: anchorAppointment.provider_id || null,
              resource_id: anchorAppointment.resource_id || null,
              category: anchorAppointment.category || null,
              color: anchorAppointment.color || null,
              notes: anchorAppointment.notes || null,
              recurrence: anchorAppointment.recurrence,
              recurrence_group_id: anchorAppointment.recurrence_group_id,
              updated_at: new Date().toISOString(),
            },
          },
          { session }
        );
      }

      for (const doc of toInsertDocs) {
        await db.collection('appointments').insertOne(doc, { session });
      }
    });
  } finally {
    await session.endSession();
  }

  return;
}

// DELETE /api/appointments/[id] - Delete appointment
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const appointmentId = Number(params.id);

    if (Number.isNaN(appointmentId)) {
      return createErrorResponse('Invalid appointment ID', 400);
    }

    const existingAppointment = await db.collection('appointments').findOne(
      {
        id: appointmentId,
        user_id: userId,
        tenant_id: tenantId,
        deleted_at: { $exists: false },
      }
    );
    if (!existingAppointment) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const result = await db.collection('appointments').updateOne(
      {
        id: appointmentId,
        user_id: userId,
        tenant_id: tenantId,
        deleted_at: { $exists: false },
      },
      {
        $set: {
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
          updated_at: new Date().toISOString(),
        },
      }
    );
    if (result.matchedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }
    if (typeof existingAppointment.client_id === 'number') {
      await updateClientStats(existingAppointment.client_id, tenantId);
    }
    await invalidateReadCaches({ tenantId, userId });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, 'Failed to delete appointment');
  }
}
