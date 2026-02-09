import { getMongoDbOrThrow } from './db/mongo-utils';
import type { ConflictCheck } from './types/calendar';

/**
 * Check if a time slot overlaps with existing appointments
 */
function doTimeSlotsOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  const s1 = start1.getTime();
  const e1 = end1.getTime();
  const s2 = start2.getTime();
  const e2 = end2.getTime();

  // Validate times
  if (s1 >= e1 || s2 >= e2) {
    return false;
  }

  // Standard overlap formula
  return s1 < e2 && e1 > s2;
}

/**
 * Comprehensive conflict detection for appointments
 * Checks:
 * 1. Provider availability (other appointments + blocked times)
 * 2. Resource availability (if resource provided)
 * 3. Provider working hours
 * 4. Suggests alternative slots if conflict found
 */
export async function checkAppointmentConflict(
  userId: number,
  providerId: number | undefined,
  resourceId: number | undefined,
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: number
): Promise<ConflictCheck> {
  const db = await getMongoDbOrThrow();
  const conflicts: any[] = [];

  // 1. Check provider appointments
  if (providerId) {
    const providerAppointments = await db
      .collection('appointments')
      .find({
        user_id: userId,
        provider_id: providerId,
        status: 'scheduled',
        start_time: {
          $lte: endTime.toISOString(),
        },
        end_time: {
          $gte: startTime.toISOString(),
        },
      })
      .toArray();

    for (const apt of providerAppointments) {
      if (excludeAppointmentId && apt.id === excludeAppointmentId) continue;

      if (doTimeSlotsOverlap(startTime, endTime, new Date(apt.start_time), new Date(apt.end_time))) {
        conflicts.push({
          type: 'provider_appointment',
          appointment: apt,
        });
      }
    }

    // Check blocked times for provider
    const blockedTimes = await db
      .collection('blocked_times')
      .find({
        user_id: userId,
        $or: [
          { provider_id: providerId },
          { provider_id: { $exists: false } }, // All-provider blocks
        ],
        start_time: {
          $lte: endTime.toISOString(),
        },
        end_time: {
          $gte: startTime.toISOString(),
        },
      })
      .toArray();

    for (const blocked of blockedTimes) {
      if (doTimeSlotsOverlap(startTime, endTime, new Date(blocked.start_time), new Date(blocked.end_time))) {
        conflicts.push({
          type: 'blocked_time',
          blockedTime: blocked,
        });
      }
    }

    // Check provider working hours
    const provider = await db.collection('providers').findOne({ id: providerId, user_id: userId });
    if (provider) {
      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][
        startTime.getDay()
      ];
      const workingHours = provider.working_hours?.[dayOfWeek];

      if (workingHours) {
        const [startHour, startMinute] = workingHours.start.split(':').map(Number);
        const [endHour, endMinute] = workingHours.end.split(':').map(Number);

        const dayStart = new Date(startTime);
        dayStart.setHours(startHour, startMinute, 0, 0);
        const dayEnd = new Date(startTime);
        dayEnd.setHours(endHour, endMinute, 0, 0);

        if (startTime < dayStart || endTime > dayEnd) {
          conflicts.push({
            type: 'outside_working_hours',
            workingHours,
          });
        }
      }
    }
  }

  // 2. Check resource availability
  if (resourceId) {
    const resourceAppointments = await db
      .collection('appointments')
      .find({
        user_id: userId,
        resource_id: resourceId,
        status: 'scheduled',
        start_time: {
          $lte: endTime.toISOString(),
        },
        end_time: {
          $gte: startTime.toISOString(),
        },
      })
      .toArray();

    for (const apt of resourceAppointments) {
      if (excludeAppointmentId && apt.id === excludeAppointmentId) continue;

      if (doTimeSlotsOverlap(startTime, endTime, new Date(apt.start_time), new Date(apt.end_time))) {
        conflicts.push({
          type: 'resource_appointment',
          appointment: apt,
        });
      }
    }

    // Check blocked times for resource
    const blockedTimes = await db
      .collection('blocked_times')
      .find({
        user_id: userId,
        $or: [
          { resource_id: resourceId },
          { resource_id: { $exists: false } }, // All-resource blocks
        ],
        start_time: {
          $lte: endTime.toISOString(),
        },
        end_time: {
          $gte: startTime.toISOString(),
        },
      })
      .toArray();

    for (const blocked of blockedTimes) {
      if (doTimeSlotsOverlap(startTime, endTime, new Date(blocked.start_time), new Date(blocked.end_time))) {
        conflicts.push({
          type: 'blocked_time',
          blockedTime: blocked,
        });
      }
    }
  }

  // 3. Generate suggestions if conflicts found
  const suggestions: Array<{ start: Date; end: Date }> = [];
  if (conflicts.length > 0) {
    // Find next 3 available slots (simple implementation)
    const duration = endTime.getTime() - startTime.getTime();
    let searchStart = new Date(endTime);
    let foundSlots = 0;

    while (foundSlots < 3) {
      const searchEnd = new Date(searchStart.getTime() + duration);

      // Quick check if this slot is free
      const hasConflict = await checkAppointmentConflict(
        userId,
        providerId,
        resourceId,
        searchStart,
        searchEnd,
        excludeAppointmentId
      );

      if (!hasConflict.hasConflict) {
        suggestions.push({ start: new Date(searchStart), end: new Date(searchEnd) });
        foundSlots++;
      }

      // Move to next 15-minute slot
      searchStart.setMinutes(searchStart.getMinutes() + 15);

      // Safety: don't search more than 7 days ahead
      if (searchStart.getTime() - startTime.getTime() > 7 * 24 * 60 * 60 * 1000) {
        break;
      }
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    suggestions,
  };
}
