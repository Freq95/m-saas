import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { updateClientStats } from '@/lib/client-matching';
import { canDeleteAppointment, canEditAppointment, getCalendarAuth } from '@/lib/calendar-auth';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { checkAppointmentConflict } from '@/lib/calendar-conflicts';
import { getAuthUser, type AuthContext } from '@/lib/auth-helpers';
import {
  getServiceOwnerScopeFromAppointment,
} from '@/lib/appointment-service';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { logger } from '@/lib/logger';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { generateRecurringInstances } from '@/lib/recurring-utils';
import { attachCalendarDisplayData } from '@/lib/server/calendar';
import { getTenantTimeZone } from '@/lib/timezone';
import { ExplicitClientSelectionError, resolveAppointmentClientLink } from '../client-linking';

const CONFLICT_MESSAGE_BY_TYPE: Record<string, string> = {
  calendar_appointment: 'Exista deja o alta programare in acest interval.',
  appointment_overlap: 'Exista deja o alta programare in acest interval.',
};

function formatConflictPayload(conflict: any) {
  const baseMessage = CONFLICT_MESSAGE_BY_TYPE[conflict.type] || 'Conflict detectat.';
  if (conflict.appointment) {
    return {
      type: conflict.type,
      message: `${baseMessage} ${conflict.appointment.client_name || 'Client'} (${conflict.appointment.start_time} - ${conflict.appointment.end_time}).`,
    };
  }
  return { type: conflict.type, message: baseMessage };
}

function matchesLegacyAppointmentOwner(
  appointment: Record<string, any>,
  auth: Pick<AuthContext, 'userId' | 'tenantId'>
): boolean {
  return appointment.user_id === auth.userId && appointment.tenant_id?.toString() === auth.tenantId.toString();
}

function appointmentMutationFilter(
  appointmentId: number,
  appointment: Record<string, any>
) {
  return typeof appointment.calendar_id === 'number'
    ? { id: appointmentId, deleted_at: { $exists: false } }
    : {
        id: appointmentId,
        user_id: appointment.user_id,
        tenant_id: appointment.tenant_id,
        deleted_at: { $exists: false },
      };
}

// GET /api/appointments/[id] - Get single appointment
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const appointmentId = Number(params.id);

    if (Number.isNaN(appointmentId)) {
      return createErrorResponse('Invalid appointment ID', 400);
    }

    const appointmentDoc = await db.collection('appointments').findOne({
      id: appointmentId,
      deleted_at: { $exists: false },
    });
    if (!appointmentDoc) {
      return createErrorResponse('Appointment not found', 404);
    }

    if (typeof appointmentDoc.calendar_id === 'number') {
      await getCalendarAuth(auth, appointmentDoc.calendar_id);
    } else if (!matchesLegacyAppointmentOwner(appointmentDoc, auth)) {
      return createErrorResponse('Appointment not found', 404);
    }

    const serviceOwnerScope = getServiceOwnerScopeFromAppointment(appointmentDoc);
    const [clientDoc, serviceDoc] = await Promise.all([
      appointmentDoc.client_id ? db.collection('clients').findOne({ id: appointmentDoc.client_id, tenant_id: appointmentDoc.tenant_id }) : null,
      appointmentDoc.service_id && serviceOwnerScope
        ? db.collection('services').findOne({
            id: appointmentDoc.service_id,
            tenant_id: serviceOwnerScope.serviceOwnerTenantId,
            user_id: serviceOwnerScope.serviceOwnerUserId,
          })
        : null,
    ]);

    const appointment = {
      ...stripMongoId(appointmentDoc),
      client_name: clientDoc?.name || appointmentDoc.client_name,
      client_email: clientDoc?.email || appointmentDoc.client_email,
      client_phone: clientDoc?.phone || appointmentDoc.client_phone,
      service_name: serviceDoc?.name || (appointmentDoc.service_name as string | null) || null,
    };
    const [decoratedAppointment] = await attachCalendarDisplayData([appointment]);

    return createSuccessResponse({ appointment: decoratedAppointment || appointment });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch appointment');
  }
}

// PATCH /api/appointments/[id] - Update appointment
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const { userId, tenantId, dbUserId } = auth;
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;
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
      clientId,
      clientName,
      clientEmail,
      clientPhone,
      forceNewClient,
      category,
      color,
      isRecurring,
      recurrence,
    } = validationResult.data;

    // Get existing appointment
    const existingAppointment = await db.collection('appointments').findOne({
      id: appointmentId,
      deleted_at: { $exists: false },
    });
    if (!existingAppointment) {
      return createErrorResponse('Appointment not found', 404);
    }

    if (typeof existingAppointment.calendar_id === 'number') {
      const calendarAuth = await getCalendarAuth(auth, existingAppointment.calendar_id);
      if (!canEditAppointment(calendarAuth, existingAppointment as any, dbUserId)) {
        return createErrorResponse('Not authorized to edit this appointment', 403);
      }
    } else if (!matchesLegacyAppointmentOwner(existingAppointment, auth)) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const appointmentTenantId = existingAppointment.tenant_id;
    const appointmentUserId = existingAppointment.user_id;
    const appointmentCalendarId = typeof existingAppointment.calendar_id === 'number'
      ? existingAppointment.calendar_id
      : undefined;
    const appointmentTimeZone = await getTenantTimeZone(appointmentTenantId);
    const mutationFilter = appointmentMutationFilter(appointmentId, existingAppointment);

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
      endTime !== undefined;

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

      // Check for conflicts (excluding this appointment)
      const conflictCheck = await checkAppointmentConflict(
        appointmentUserId,
        appointmentTenantId,
        newStartTime,
        newEndTime,
        appointmentId,
        true,
        {
          calendarId: appointmentCalendarId,
          timeZone: appointmentTimeZone,
        }
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
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    if (serviceId !== undefined) {
      const serviceOwnerScope = getServiceOwnerScopeFromAppointment(existingAppointment);
      if (!serviceOwnerScope) {
        return createErrorResponse('Assigned dentist context is missing for this appointment', 400);
      }
      const serviceDoc = await db.collection('services').findOne({
        id: serviceId,
        user_id: serviceOwnerScope.serviceOwnerUserId,
        tenant_id: serviceOwnerScope.serviceOwnerTenantId,
        deleted_at: { $exists: false },
      });
      if (!serviceDoc) {
        return createErrorResponse('Selected service was not found for the assigned dentist', 400);
      }
      updates.service_id = serviceId;
      updates.service_name = serviceDoc.name || null;
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

      const linkedClient = await resolveAppointmentClientLink({
        db,
        userId: appointmentUserId,
        tenantId: appointmentTenantId,
        clientId,
        name: normalizedName,
        email: normalizedEmail,
        phone: normalizedPhone,
        forceNewClient: forceNewClient ?? false,
        overwriteContactFields: true,
      });

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
      mutationFilter,
      { $set: updates }
    );
    if (updateResult.matchedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const appointmentDoc = await db.collection('appointments').findOne({
      ...mutationFilter,
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
          appointmentTenantId,
          instance.start,
          instance.end,
          undefined,
          true,
          {
            calendarId: typeof appointmentDoc.calendar_id === 'number' ? appointmentDoc.calendar_id : undefined,
            timeZone: appointmentTimeZone,
          }
        );
        if (conflictCheck.hasConflict) {
          continue;
        }

        const nextRecurringId = await getNextNumericId('appointments');
        const nowIso = new Date().toISOString();
        await db.collection<FlexDoc>('appointments').insertOne({
          id: nextRecurringId,
          _id: nextRecurringId,
          tenant_id: appointmentTenantId,
          user_id: appointmentDoc.user_id,
          calendar_id: appointmentDoc.calendar_id || null,
          created_by_user_id: appointmentDoc.created_by_user_id || null,
          dentist_db_user_id: appointmentDoc.dentist_db_user_id || null,
          service_owner_user_id: appointmentDoc.service_owner_user_id || appointmentDoc.user_id,
          service_owner_tenant_id: appointmentDoc.service_owner_tenant_id || appointmentTenantId,
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
        tenantId: appointmentTenantId,
        anchorAppointment: appointmentDoc,
        timeZone: appointmentTimeZone,
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
      await Promise.all(Array.from(impactedClientIds).map((clientId) => updateClientStats(clientId, appointmentTenantId)));
    }
    await invalidateReadCaches({
      tenantId: appointmentTenantId,
      userId: appointmentUserId,
      calendarId: appointmentCalendarId,
    });
    return createSuccessResponse({ appointment: stripMongoId(appointmentDoc), warning });
  } catch (error) {
    if (error instanceof ExplicitClientSelectionError) {
      return createErrorResponse(error.message, 409);
    }
    return handleApiError(error, 'Failed to update appointment');
  }
}

async function syncRecurringSeriesFromAnchor({
  db,
  tenantId,
  anchorAppointment,
  timeZone,
}: {
  db: any;
  tenantId: any;
  anchorAppointment: any;
  timeZone: string;
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
      desired.start,
      desired.end,
      undefined,
      true,
      {
        calendarId: typeof anchorAppointment.calendar_id === 'number' ? anchorAppointment.calendar_id : undefined,
        timeZone,
      }
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
      calendar_id: anchorAppointment.calendar_id || null,
      created_by_user_id: anchorAppointment.created_by_user_id || null,
      dentist_db_user_id: anchorAppointment.dentist_db_user_id || null,
      service_owner_user_id: anchorAppointment.service_owner_user_id || anchorAppointment.user_id,
      service_owner_tenant_id: anchorAppointment.service_owner_tenant_id || tenantId,
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
              dentist_db_user_id: anchorAppointment.dentist_db_user_id || null,
              service_owner_user_id: anchorAppointment.service_owner_user_id || anchorAppointment.user_id,
              service_owner_tenant_id: anchorAppointment.service_owner_tenant_id || tenantId,
              service_name: anchorAppointment.service_name || null,
              client_id: anchorAppointment.client_id || null,
              client_name: anchorAppointment.client_name || null,
              client_email: anchorAppointment.client_email || null,
              client_phone: anchorAppointment.client_phone || null,
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
    const auth = await getAuthUser();
    const { userId, dbUserId } = auth;
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;
    const db = await getMongoDbOrThrow();
    const appointmentId = Number(params.id);

    if (Number.isNaN(appointmentId)) {
      return createErrorResponse('Invalid appointment ID', 400);
    }

    const existingAppointment = await db.collection('appointments').findOne(
      {
        id: appointmentId,
        deleted_at: { $exists: false },
      }
    );
    if (!existingAppointment) {
      return createErrorResponse('Appointment not found', 404);
    }

    if (typeof existingAppointment.calendar_id === 'number') {
      const calendarAuth = await getCalendarAuth(auth, existingAppointment.calendar_id);
      if (!canDeleteAppointment(calendarAuth, existingAppointment as any, dbUserId)) {
        return createErrorResponse('Not authorized to delete this appointment', 403);
      }
    } else if (!matchesLegacyAppointmentOwner(existingAppointment, auth)) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const result = await db.collection('appointments').updateOne(
      appointmentMutationFilter(appointmentId, existingAppointment),
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
      await updateClientStats(existingAppointment.client_id, existingAppointment.tenant_id);
    }
    await invalidateReadCaches({
      tenantId: existingAppointment.tenant_id,
      userId: existingAppointment.user_id,
      calendarId: typeof existingAppointment.calendar_id === 'number' ? existingAppointment.calendar_id : undefined,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error, 'Failed to delete appointment');
  }
}
