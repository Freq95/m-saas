import { getMongoDbOrThrow } from './db/mongo-utils';
import { addMinutes } from 'date-fns';
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
