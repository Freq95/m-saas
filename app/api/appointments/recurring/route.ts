import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId } from '@/lib/db/mongo-utils';
import { checkAppointmentConflict } from '@/lib/calendar-conflicts';
import type { RecurrenceRule } from '@/lib/types/calendar';
import { getAuthUser } from '@/lib/auth-helpers';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { logger } from '@/lib/logger';
import { generateRecurringInstances } from '@/lib/recurring-utils';
import { checkWriteRateLimit } from '@/lib/rate-limit';

interface RecurringConflict {
  start: Date;
  end: Date;
  conflicts: unknown[];
}

// Cleanup classification: feature-flagged (advanced scheduling domain, no core UI dependency).
// POST /api/appointments/recurring - Create recurring appointments
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const limited = await checkWriteRateLimit(userId);
    if (limited) return limited;
    const body = await request.json();
    const { createRecurringAppointmentSchema } = await import('@/lib/validation');
    const validationResult = createRecurringAppointmentSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.errors },
        { status: 400 }
      );
    }
    const {
      serviceId,
      clientName,
      clientEmail,
      clientPhone,
      startTime,
      endTime,
      providerId,
      resourceId,
      notes,
      category,
      color,
      recurrence,
      forceNewClient,
    } = validationResult.data;

    const db = await getMongoDbOrThrow();
    const normalizedUserId = Number(userId);
    const normalizedServiceId = Number(serviceId);
    const normalizedProviderId = providerId ? Number(providerId) : undefined;
    const normalizedResourceId = resourceId ? Number(resourceId) : undefined;

    if (
      Number.isNaN(normalizedUserId) ||
      Number.isNaN(normalizedServiceId) ||
      (normalizedProviderId !== undefined && Number.isNaN(normalizedProviderId)) ||
      (normalizedResourceId !== undefined && Number.isNaN(normalizedResourceId))
    ) {
      return NextResponse.json({ error: 'Invalid numeric fields' }, { status: 400 });
    }

    const { findOrCreateClient, updateClientStats } = await import('@/lib/client-matching');
    const client = await findOrCreateClient(
      normalizedUserId,
      tenantId,
      clientName,
      clientEmail || undefined,
      clientPhone || undefined,
      forceNewClient
    );

    const recurrenceRule: RecurrenceRule = {
      frequency: recurrence.frequency,
      interval: Math.max(1, Number(recurrence.interval) || 1),
      end_date: recurrence.end_date || recurrence.endDate,
      count: recurrence.count,
    };

    const startDateObj = new Date(startTime);
    const endDateObj = new Date(endTime);
    if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime()) || startDateObj >= endDateObj) {
      return NextResponse.json({ error: 'Invalid appointment time range' }, { status: 400 });
    }

    // Generate recurrence group ID atomically to avoid collisions under concurrent requests
    const recurrenceGroupId = await getNextNumericId('recurrence_groups');

    // Generate all recurring instances
    const instances = generateRecurringInstances(
      new Date(startTime),
      new Date(endTime),
      recurrenceRule
    );

    // Add the first instance to the array
    instances.unshift({
      start: new Date(startTime),
      end: new Date(endTime),
    });

    const createdAppointments: Record<string, unknown>[] = [];
    const conflicts: RecurringConflict[] = [];

    // Get service details
    const service = await db.collection('services').findOne({ id: normalizedServiceId, tenant_id: tenantId, deleted_at: { $exists: false } });
    const serviceName = service?.name || 'Unknown Service';

    // Create each instance
    for (const instance of instances) {
      // Check for conflicts
      const conflictCheck = await checkAppointmentConflict(
        normalizedUserId,
        tenantId,
        normalizedProviderId,
        normalizedResourceId,
        instance.start,
        instance.end
      );

      if (conflictCheck.hasConflict) {
        conflicts.push({
          start: instance.start,
          end: instance.end,
          conflicts: conflictCheck.conflicts,
        });
        continue; // Skip this instance
      }

      const nextId = await getNextNumericId('appointments');

      const appointment: Record<string, unknown> = {
        id: nextId,
        _id: nextId,
        tenant_id: tenantId,
        user_id: normalizedUserId,
        service_id: normalizedServiceId,
        service_name: serviceName,
        client_id: client.id,
        client_name: clientName,
        start_time: instance.start.toISOString(),
        end_time: instance.end.toISOString(),
        status: 'scheduled',
        recurrence: recurrenceRule,
        recurrence_group_id: recurrenceGroupId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (clientEmail) appointment.client_email = clientEmail;
      if (clientPhone) appointment.client_phone = clientPhone;
      if (normalizedProviderId) appointment.provider_id = normalizedProviderId;
      if (normalizedResourceId) appointment.resource_id = normalizedResourceId;
      if (notes) appointment.notes = notes;
      if (category !== undefined) appointment.category = category || null;
      if (color !== undefined) appointment.color = color || null;

      await db.collection('appointments').insertOne(appointment);
      createdAppointments.push(appointment);
    }

    if (createdAppointments.length > 0) {
      await updateClientStats(client.id, tenantId);
    }

    await invalidateReadCaches({ tenantId, userId: normalizedUserId });

    return NextResponse.json(
      {
        created: createdAppointments.length,
        created_count: createdAppointments.length,
        skipped: conflicts.length,
        appointments: createdAppointments,
        conflicts: conflicts.length > 0 ? conflicts : undefined,
        recurrence_group_id: recurrenceGroupId,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error(
      'Recurring appointments: failed to create appointments',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to create recurring appointments' },
      { status: 500 }
    );
  }
}
