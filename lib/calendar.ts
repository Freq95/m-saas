import { getMongoDbOrThrow } from './db/mongo-utils';
import { format, addMinutes } from 'date-fns';
import { ro } from 'date-fns/locale';
import { ObjectId } from 'mongodb';
import {
  DEFAULT_TIME_ZONE,
  addDaysToDateKey,
  buildDateInTimeZone,
  getDayBoundsInTimeZone,
  getTimeZoneDateKey,
} from './timezone';

export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
}

export interface Service {
  id: number;
  name: string;
  duration_minutes: number;
  price?: number;
}

interface SlotFilterOptions {
  calendarId?: number;
  timeZone?: string;
}

/**
 * Get available time slots for a given date
 */
export async function getAvailableSlots(
  userId: number,
  tenantId: ObjectId,
  date: Date,
  serviceDuration: number,
  workingHours: { start: string; end: string } = { start: '09:00', end: '18:00' },
  options: SlotFilterOptions = {}
): Promise<TimeSlot[]> {
  const db = await getMongoDbOrThrow();
  const resolvedTimeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const { start: dayStart, dateKey } = getDayBoundsInTimeZone(date, resolvedTimeZone);
  const nextDayStart = buildDateInTimeZone(addDaysToDateKey(dateKey, 1), resolvedTimeZone, 0, 0, 0);

  // Get all appointments for the day
  const appointmentFilter: Record<string, any> = {
    tenant_id: tenantId,
    deleted_at: { $exists: false },
    status: 'scheduled',
    start_time: { $lt: nextDayStart.toISOString() },
    end_time: { $gt: dayStart.toISOString() },
    ...(options.calendarId ? { calendar_id: options.calendarId } : { user_id: userId }),
  };

  const appointments = await db
    .collection('appointments')
    .find(appointmentFilter)
    .toArray();

  const bookedSlots = appointments.map((row: any) => ({
    start: new Date(row.start_time),
    end: new Date(row.end_time),
  }));

  // Generate time slots (every 15 minutes)
  const slots: TimeSlot[] = [];
  const [startHour, startMinute] = workingHours.start.split(':').map(Number);
  const [endHour, endMinute] = workingHours.end.split(':').map(Number);

  const slotStart = buildDateInTimeZone(dateKey, resolvedTimeZone, startHour, startMinute, 0);
  const dayEndTime = buildDateInTimeZone(dateKey, resolvedTimeZone, endHour, endMinute, 0);

  while (slotStart < dayEndTime) {
    const slotEnd = addMinutes(slotStart, serviceDuration);

    if (slotEnd <= dayEndTime) {
      // Check if this slot overlaps with any booked appointment
      const isAvailable = !bookedSlots.some((booked: any) => {
        return (
          (slotStart >= booked.start && slotStart < booked.end) ||
          (slotEnd > booked.start && slotEnd <= booked.end) ||
          (slotStart <= booked.start && slotEnd >= booked.end)
        );
      });

      slots.push({
        start: new Date(slotStart),
        end: new Date(slotEnd),
        available: isAvailable,
      });
    }

    slotStart.setMinutes(slotStart.getMinutes() + 15);
  }

  return slots;
}

/**
 * Get 2-3 available time slots for the next few days
 */
export async function getSuggestedSlots(
  userId: number,
  tenantId: ObjectId,
  serviceDuration: number,
  daysAhead: number = 7,
  options: SlotFilterOptions = {}
): Promise<Array<{ date: Date; slots: TimeSlot[] }>> {
  const suggestions: Array<{ date: Date; slots: TimeSlot[] }> = [];
  const resolvedTimeZone = options.timeZone || DEFAULT_TIME_ZONE;
  const todayDateKey = getTimeZoneDateKey(new Date(), resolvedTimeZone);

  for (let i = 0; i < daysAhead; i++) {
    const dateKey = addDaysToDateKey(todayDateKey, i);
    const date = buildDateInTimeZone(dateKey, resolvedTimeZone, 0, 0, 0);

    const slots = await getAvailableSlots(
      userId,
      tenantId,
      date,
      serviceDuration,
      { start: '09:00', end: '18:00' },
      { ...options, timeZone: resolvedTimeZone }
    );
    const availableSlots = slots.filter((slot) => slot.available).slice(0, 3);

    if (availableSlots.length > 0) {
      suggestions.push({
        date,
        slots: availableSlots,
      });
    }

    if (suggestions.length >= 3) break;
  }

  return suggestions;
}

/**
 * Check if two time slots overlap
 */
function doTimeSlotsOverlap(
  slot1Start: Date,
  slot1End: Date,
  slot2Start: Date,
  slot2End: Date
): boolean {
  const start1 = slot1Start.getTime();
  const end1 = slot1End.getTime();
  const start2 = slot2Start.getTime();
  const end2 = slot2End.getTime();

  if (start1 >= end1 || start2 >= end2) {
    console.warn('Invalid time slot: start time must be before end time', {
      slot1: { start: slot1Start, end: slot1End },
      slot2: { start: slot2Start, end: slot2End }
    });
    return false;
  }

  return start1 < end2 && end1 > start2;
}

/**
 * Check if a time slot is available
 */
export async function isSlotAvailable(
  userId: number,
  tenantId: ObjectId,
  startTime: Date,
  endTime: Date,
  options: SlotFilterOptions = {}
): Promise<boolean> {
  const db = await getMongoDbOrThrow();

  const appointmentFilter: Record<string, any> = {
    tenant_id: tenantId,
    deleted_at: { $exists: false },
    status: 'scheduled',
    start_time: { $lt: endTime.toISOString() },
    end_time: { $gt: startTime.toISOString() },
    ...(options.calendarId ? { calendar_id: options.calendarId } : { user_id: userId }),
  };

  const appointments = await db
    .collection('appointments')
    .find(appointmentFilter)
    .toArray();

  for (const apt of appointments) {
    const aptStart = new Date(apt.start_time);
    const aptEnd = new Date(apt.end_time);
    if (doTimeSlotsOverlap(startTime, endTime, aptStart, aptEnd)) {
      return false;
    }
  }

  return true;
}

/**
 * Format time slot for display
 */
export function formatTimeSlot(slot: TimeSlot): string {
  return format(slot.start, "EEEE, d MMMM 'la' HH:mm", { locale: ro });
}
