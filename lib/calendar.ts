import { getDb } from './db';
import { format, addMinutes, startOfDay, endOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';

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

/**
 * Get available time slots for a given date
 */
export async function getAvailableSlots(
  userId: number,
  date: Date,
  serviceDuration: number,
  workingHours: { start: string; end: string } = { start: '09:00', end: '18:00' }
): Promise<TimeSlot[]> {
  const db = getDb();
  
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  
  // Get all appointments for the day
  const appointmentsResult = await db.query(
    `SELECT start_time, end_time 
     FROM appointments 
     WHERE user_id = $1 
       AND start_time >= $2 
       AND start_time < $3 
       AND status = 'scheduled'`,
    [userId, dayStart, dayEnd]
  );

  const bookedSlots = appointmentsResult.rows.map((row: any) => ({
    start: new Date(row.start_time),
    end: new Date(row.end_time),
  }));

  // Generate time slots (every 15 minutes)
  const slots: TimeSlot[] = [];
  const [startHour, startMinute] = workingHours.start.split(':').map(Number);
  const [endHour, endMinute] = workingHours.end.split(':').map(Number);
  
  const slotStart = new Date(date);
  slotStart.setHours(startHour, startMinute, 0, 0);
  
  const dayEndTime = new Date(date);
  dayEndTime.setHours(endHour, endMinute, 0, 0);

  while (slotStart < dayEndTime) {
    const slotEnd = addMinutes(slotStart, serviceDuration);
    
    if (slotEnd <= dayEndTime) {
      // Check if this slot overlaps with any booked appointment
      const isAvailable = !bookedSlots.some(booked => {
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
  serviceDuration: number,
  daysAhead: number = 7
): Promise<Array<{ date: Date; slots: TimeSlot[] }>> {
  const suggestions: Array<{ date: Date; slots: TimeSlot[] }> = [];
  const today = new Date();

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    
    const slots = await getAvailableSlots(userId, date, serviceDuration);
    const availableSlots = slots.filter(s => s.available).slice(0, 3);

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
 * 
 * Uses the standard overlap formula: slot1.start < slot2.end && slot1.end > slot2.start
 * 
 * This formula correctly handles all overlap scenarios:
 * - Partial overlap (one slot partially overlaps the other)
 * - Complete containment (one slot is completely inside the other)
 * - Exact match (slots start/end at the same time)
 * - Adjacent slots (slots that touch but don't overlap return false)
 * 
 * Examples:
 * - [10:00-11:00] and [10:30-11:30] overlap ✓
 * - [10:00-12:00] and [10:30-11:00] overlap ✓ (containment)
 * - [10:00-11:00] and [11:00-12:00] don't overlap ✗ (adjacent, touching)
 * - [10:00-11:00] and [11:01-12:00] don't overlap ✗ (separate)
 */
function doTimeSlotsOverlap(
  slot1Start: Date,
  slot1End: Date,
  slot2Start: Date,
  slot2End: Date
): boolean {
  // Convert to timestamps for reliable numeric comparison
  const start1 = slot1Start.getTime();
  const end1 = slot1End.getTime();
  const start2 = slot2Start.getTime();
  const end2 = slot2End.getTime();
  
  // Validate that start times are before end times
  if (start1 >= end1 || start2 >= end2) {
    console.warn('Invalid time slot: start time must be before end time', {
      slot1: { start: slot1Start, end: slot1End },
      slot2: { start: slot2Start, end: slot2End }
    });
    return false;
  }
  
  // Standard overlap formula: two intervals overlap if:
  // interval1.start < interval2.end AND interval1.end > interval2.start
  return start1 < end2 && end1 > start2;
}

/**
 * Check if a time slot is available
 * This function fetches potentially overlapping appointments and checks overlap in JavaScript
 * to avoid complex SQL parsing issues. This approach is more reliable and easier to debug.
 * 
 * Strategy:
 * 1. Fetch all scheduled appointments for the user within a reasonable time window (same day)
 * 2. Use simple WHERE conditions that are easy to parse (no complex OR logic)
 * 3. Check overlaps in JavaScript using a robust overlap detection function
 */
export async function isSlotAvailable(
  userId: number,
  startTime: Date,
  endTime: Date
): Promise<boolean> {
  const db = getDb();
  
  // Calculate search window: check appointments on the same day
  // This ensures we catch all potentially overlapping appointments without complex SQL
  const searchWindowStart = new Date(startTime);
  searchWindowStart.setHours(0, 0, 0, 0); // Start of day
  
  const searchWindowEnd = new Date(endTime);
  searchWindowEnd.setHours(23, 59, 59, 999); // End of day
  
  // Fetch all scheduled appointments for this user on the same day(s)
  // Using simple WHERE conditions: user_id, status, and date range
  // No complex OR conditions that might have parsing issues
  const result = await db.query(
    `SELECT start_time, end_time 
     FROM appointments 
     WHERE user_id = $1 
       AND status = $2
       AND start_time >= $3
       AND start_time <= $4`,
    [userId, 'scheduled', searchWindowStart.toISOString(), searchWindowEnd.toISOString()]
  );

  const appointments = result.rows || [];
  
  // Also check appointments that start on previous days but end during our window
  // This catches appointments that span multiple days or start before our window
  if (searchWindowStart.getTime() !== searchWindowEnd.getTime()) {
    const dayBeforeStart = new Date(searchWindowStart);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
    dayBeforeStart.setHours(0, 0, 0, 0);
    
    const result2 = await db.query(
      `SELECT start_time, end_time 
       FROM appointments 
       WHERE user_id = $1 
         AND status = $2
         AND start_time >= $3
         AND start_time < $4
         AND end_time >= $4`,
      [userId, 'scheduled', dayBeforeStart.toISOString(), searchWindowStart.toISOString()]
    );
    
    appointments.push(...(result2.rows || []));
  }

  // Remove duplicates by converting to a Set using a unique key
  const uniqueAppointments = Array.from(
    new Map(appointments.map(apt => [`${apt.start_time}-${apt.end_time}`, apt])).values()
  );

  // Check overlap in JavaScript - more reliable than complex SQL
  // This uses a simple, well-tested overlap formula
  for (const apt of uniqueAppointments) {
    const aptStart = new Date(apt.start_time);
    const aptEnd = new Date(apt.end_time);
    
    // Check if this appointment overlaps with the requested time slot
    if (doTimeSlotsOverlap(startTime, endTime, aptStart, aptEnd)) {
      return false; // Slot is not available - found an overlapping appointment
    }
  }

  return true; // No overlapping appointments found, slot is available
}

/**
 * Format time slot for display
 */
export function formatTimeSlot(slot: TimeSlot): string {
  return format(slot.start, "EEEE, d MMMM 'la' HH:mm", { locale: ro });
}

