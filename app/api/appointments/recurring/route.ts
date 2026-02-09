import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
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

    // Generate recurrence group ID
    const recurrenceGroupId = Date.now();

    // Generate all recurring instances
    const instances = generateRecurringInstances(
      new Date(startTime),
      new Date(endTime),
      recurrence
    );

    // Add the first instance to the array
    instances.unshift({
      start: new Date(startTime),
      end: new Date(endTime),
    });

    const createdAppointments: any[] = [];
    const conflicts: any[] = [];

    // Get service details
    const service = await db.collection('services').findOne({ id: serviceId });
    const serviceName = service?.name || 'Unknown Service';

    // Create each instance
    for (const instance of instances) {
      // Check for conflicts
      const conflictCheck = await checkAppointmentConflict(
        parseInt(userId),
        providerId ? parseInt(providerId) : undefined,
        resourceId ? parseInt(resourceId) : undefined,
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

      // Get next ID
      const lastAppointment = await db
        .collection('appointments')
        .find()
        .sort({ id: -1 })
        .limit(1)
        .toArray();
      const nextId = lastAppointment.length > 0 ? lastAppointment[0].id + 1 : 1;

      const appointment: any = {
        id: nextId,
        user_id: parseInt(userId),
        service_id: parseInt(serviceId),
        service_name: serviceName,
        client_name: clientName,
        start_time: instance.start.toISOString(),
        end_time: instance.end.toISOString(),
        status: 'scheduled',
        recurrence,
        recurrence_group_id: recurrenceGroupId,
        created_at: new Date(),
      };

      if (clientEmail) appointment.client_email = clientEmail;
      if (clientPhone) appointment.client_phone = clientPhone;
      if (providerId) appointment.provider_id = parseInt(providerId);
      if (resourceId) appointment.resource_id = parseInt(resourceId);
      if (notes) appointment.notes = notes;

      await db.collection('appointments').insertOne(appointment);
      createdAppointments.push(appointment);
    }

    return NextResponse.json(
      {
        created_count: createdAppointments.length,
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

  let currentStart = new Date(startTime);
  let count = 0;
  const maxCount = recurrence.count || 52; // Default max 52 occurrences

  while (count < maxCount - 1) {
    // -1 because first instance is already created
    // Calculate next occurrence based on frequency
    if (recurrence.frequency === 'daily') {
      currentStart.setDate(currentStart.getDate() + recurrence.interval);
    } else if (recurrence.frequency === 'weekly') {
      currentStart.setDate(currentStart.getDate() + 7 * recurrence.interval);
    } else if (recurrence.frequency === 'monthly') {
      currentStart.setMonth(currentStart.getMonth() + recurrence.interval);
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
