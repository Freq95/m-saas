import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId } from '@/lib/db/mongo-utils';
import { checkAppointmentConflict } from '@/lib/calendar-conflicts';
import type { RecurrenceRule } from '@/lib/types/calendar';

// Cleanup classification: feature-flagged (advanced scheduling domain, no core UI dependency).
// POST /api/appointments/recurring - Create recurring appointments
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      serviceId,
      clientName,
      clientEmail,
      clientPhone,
      startTime,
      endTime,
      providerId,
      resourceId,
      notes,
      recurrence,
    } = body;

    if (!userId || !serviceId || !clientName || !startTime || !endTime || !recurrence) {
      return NextResponse.json(
        { error: 'userId, serviceId, clientName, startTime, endTime, and recurrence are required' },
        { status: 400 }
      );
    }

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

    const recurrenceRule: RecurrenceRule = {
      ...recurrence,
      interval: Math.max(1, Number(recurrence.interval) || 1),
      end_date: recurrence.end_date || recurrence.endDate,
    };

    const startDateObj = new Date(startTime);
    const endDateObj = new Date(endTime);
    if (Number.isNaN(startDateObj.getTime()) || Number.isNaN(endDateObj.getTime()) || startDateObj >= endDateObj) {
      return NextResponse.json({ error: 'Invalid appointment time range' }, { status: 400 });
    }

    // Generate recurrence group ID
    const recurrenceGroupId = Date.now();

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

    const createdAppointments: any[] = [];
    const conflicts: any[] = [];

    // Get service details
    const service = await db.collection('services').findOne({ id: normalizedServiceId });
    const serviceName = service?.name || 'Unknown Service';

    // Create each instance
    for (const instance of instances) {
      // Check for conflicts
      const conflictCheck = await checkAppointmentConflict(
        normalizedUserId,
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

      const appointment: any = {
        id: nextId,
        _id: nextId,
        user_id: normalizedUserId,
        service_id: normalizedServiceId,
        service_name: serviceName,
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

      await db.collection('appointments').insertOne(appointment);
      createdAppointments.push(appointment);
    }

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
    console.error('Error creating recurring appointments:', error);
    return NextResponse.json(
      { error: 'Failed to create recurring appointments' },
      { status: 500 }
    );
  }
}

// Helper function to generate recurring instances
function generateRecurringInstances(
  startTime: Date,
  endTime: Date,
  recurrence: RecurrenceRule
): Array<{ start: Date; end: Date }> {
  const instances: Array<{ start: Date; end: Date }> = [];
  const duration = endTime.getTime() - startTime.getTime();
  const safeInterval = Math.max(1, Number(recurrence.interval) || 1);

  let currentStart = new Date(startTime);
  let count = 0;
  const maxCount = recurrence.count || 52; // Default max 52 occurrences

  while (count < maxCount - 1) {
    // -1 because first instance is already created
    // Calculate next occurrence based on frequency
    if (recurrence.frequency === 'daily') {
      currentStart.setDate(currentStart.getDate() + safeInterval);
    } else if (recurrence.frequency === 'weekly') {
      currentStart.setDate(currentStart.getDate() + 7 * safeInterval);
    } else if (recurrence.frequency === 'monthly') {
      currentStart.setMonth(currentStart.getMonth() + safeInterval);
    }

    // Check end condition
    if (recurrence.end_date && currentStart > new Date(recurrence.end_date)) {
      break;
    }

    const currentEnd = new Date(currentStart.getTime() + duration);
    instances.push({ start: new Date(currentStart), end: currentEnd });

    count++;
  }

  return instances;
}
