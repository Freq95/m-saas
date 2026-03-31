import { getMongoDbOrThrow } from './db/mongo-utils';
import type { ConflictCheck } from './types/calendar';
import { ObjectId, type Document, type Filter } from 'mongodb';

type BusyInterval = Document & {
  start_time: string | Date;
  end_time: string | Date;
};

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

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
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
  tenantId: ObjectId,
  providerId: number | undefined,
  resourceId: number | undefined,
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: number,
  includeSuggestions: boolean = true
): Promise<ConflictCheck> {
  const db = await getMongoDbOrThrow();
  const conflicts: any[] = [];

  // Base check for non-provider/resource appointments (single-calendar mode)
  if (!providerId && !resourceId) {
    const appointments = await db
      .collection('appointments')
      .find({
        user_id: userId,
        tenant_id: tenantId,
        deleted_at: { $exists: false },
        status: 'scheduled',
        start_time: { $lt: endTime.toISOString() },
        end_time: { $gt: startTime.toISOString() },
      })
      .toArray();

    for (const apt of appointments) {
      if (excludeAppointmentId && apt.id === excludeAppointmentId) continue;
      if (doTimeSlotsOverlap(startTime, endTime, new Date(apt.start_time), new Date(apt.end_time))) {
        conflicts.push({
          type: 'provider_appointment',
          appointment: apt,
        });
      }
    }

    const blockedTimes = await db
      .collection('blocked_times')
      .find({
        user_id: userId,
        tenant_id: tenantId,
        deleted_at: { $exists: false },
        $and: [
          { $or: [{ provider_id: { $exists: false } }, { provider_id: null }] },
          { $or: [{ resource_id: { $exists: false } }, { resource_id: null }] },
        ],
      })
      .toArray();

    for (const blocked of blockedTimes) {
      const blockedStart = toDate(blocked.start_time);
      const blockedEnd = toDate(blocked.end_time);
      if (!blockedStart || !blockedEnd) continue;
      if (doTimeSlotsOverlap(startTime, endTime, blockedStart, blockedEnd)) {
        conflicts.push({
          type: 'blocked_time',
          blockedTime: blocked,
        });
      }
    }
  }

  // 1. Check provider appointments
  if (providerId) {
    const providerAppointments = await db
      .collection('appointments')
      .find({
        user_id: userId,
        tenant_id: tenantId,
        provider_id: providerId,
        deleted_at: { $exists: false },
        status: 'scheduled',
        start_time: {
          $lt: endTime.toISOString(),
        },
        end_time: {
          $gt: startTime.toISOString(),
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
        tenant_id: tenantId,
        deleted_at: { $exists: false },
        $or: [
          { provider_id: providerId },
          { provider_id: { $exists: false } }, // All-provider blocks
        ],
      })
      .toArray();

    for (const blocked of blockedTimes) {
      const blockedStart = toDate(blocked.start_time);
      const blockedEnd = toDate(blocked.end_time);
      if (!blockedStart || !blockedEnd) continue;
      if (doTimeSlotsOverlap(startTime, endTime, blockedStart, blockedEnd)) {
        conflicts.push({
          type: 'blocked_time',
          blockedTime: blocked,
        });
      }
    }

    // Check provider working hours
    const provider = await db.collection('providers').findOne({ id: providerId, user_id: userId, tenant_id: tenantId });
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
        tenant_id: tenantId,
        resource_id: resourceId,
        deleted_at: { $exists: false },
        status: 'scheduled',
        start_time: {
          $lt: endTime.toISOString(),
        },
        end_time: {
          $gt: startTime.toISOString(),
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
        tenant_id: tenantId,
        deleted_at: { $exists: false },
        $or: [
          { resource_id: resourceId },
          { resource_id: { $exists: false } }, // All-resource blocks
        ],
      })
      .toArray();

    for (const blocked of blockedTimes) {
      const blockedStart = toDate(blocked.start_time);
      const blockedEnd = toDate(blocked.end_time);
      if (!blockedStart || !blockedEnd) continue;
      if (doTimeSlotsOverlap(startTime, endTime, blockedStart, blockedEnd)) {
        conflicts.push({
          type: 'blocked_time',
          blockedTime: blocked,
        });
      }
    }
  }

  // 3. Generate suggestions if conflicts found
  const suggestions: Array<{ start: Date; end: Date }> = [];
  if (includeSuggestions && conflicts.length > 0) {
    const duration = endTime.getTime() - startTime.getTime();
    const searchWindowEnd = new Date(endTime.getTime() + 48 * 60 * 60 * 1000);

    const busyQuery: Filter<BusyInterval> = {
      user_id: userId,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
      status: { $ne: 'cancelled' },
      start_time: { $lt: searchWindowEnd.toISOString() },
      end_time: { $gt: endTime.toISOString() },
      ...(excludeAppointmentId ? { id: { $ne: excludeAppointmentId } } : {}),
      ...(providerId ? { provider_id: providerId } : {}),
      ...(resourceId ? { resource_id: resourceId } : {}),
    };

    const busyIntervals = (await db.collection('appointments').find(busyQuery as any).toArray()) as unknown as BusyInterval[];

    let searchStart = new Date(endTime);
    let foundSlots = 0;
    while (foundSlots < 3 && searchStart < searchWindowEnd) {
      const searchEnd = new Date(searchStart.getTime() + duration);
      const hasOverlap = busyIntervals.some((b: BusyInterval) => {
        const bStart = new Date(b.start_time);
        const bEnd = new Date(b.end_time);
        return !isNaN(bStart.getTime()) && !isNaN(bEnd.getTime()) && bStart < searchEnd && bEnd > searchStart;
      });
      if (!hasOverlap) {
        suggestions.push({ start: new Date(searchStart), end: new Date(searchEnd) });
        foundSlots++;
      }
      searchStart = new Date(searchStart.getTime() + 15 * 60 * 1000);
    }
  }

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    suggestions,
  };
}
