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

  if (s1 >= e1 || s2 >= e2) {
    return false;
  }

  return s1 < e2 && e1 > s2;
}

/**
 * Comprehensive conflict detection for appointments
 * Checks overlapping appointments and suggests alternative slots if conflict found
 */
export async function checkAppointmentConflict(
  userId: number,
  tenantId: ObjectId,
  startTime: Date,
  endTime: Date,
  excludeAppointmentId?: number,
  includeSuggestions: boolean = true,
  options: {
    calendarId?: number;
  } = {}
): Promise<ConflictCheck> {
  const db = await getMongoDbOrThrow();
  const conflicts: any[] = [];
  const appointmentScope = options.calendarId
    ? { calendar_id: options.calendarId, tenant_id: tenantId }
    : { user_id: userId, tenant_id: tenantId };

  const appointments = await db
    .collection('appointments')
    .find({
      ...appointmentScope,
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
        type: 'calendar_appointment',
        appointment: apt,
      });
    }
  }

  // Generate suggestions if conflicts found
  const suggestions: Array<{ start: Date; end: Date }> = [];
  if (includeSuggestions && conflicts.length > 0) {
    const duration = endTime.getTime() - startTime.getTime();
    const searchWindowEnd = new Date(endTime.getTime() + 48 * 60 * 60 * 1000);

    const busyQuery: Filter<BusyInterval> = {
      ...appointmentScope,
      deleted_at: { $exists: false },
      status: 'scheduled',
      start_time: { $lt: searchWindowEnd.toISOString() },
      end_time: { $gt: endTime.toISOString() },
      ...(excludeAppointmentId ? { id: { $ne: excludeAppointmentId } } : {}),
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
