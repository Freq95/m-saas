import { getMongoDbOrThrow } from './db/mongo-utils';
import { format, addMinutes, startOfDay, endOfDay } from 'date-fns';
import { ro } from 'date-fns/locale';
import { ObjectId } from 'mongodb';

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
  providerId?: number;
  resourceId?: number;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function appliesToScope(blocked: any, options: SlotFilterOptions): boolean {
  const providerOk = options.providerId
    ? blocked.provider_id === options.providerId || blocked.provider_id === null || blocked.provider_id === undefined
    : blocked.provider_id === null || blocked.provider_id === undefined;
  const resourceOk = options.resourceId
    ? blocked.resource_id === options.resourceId || blocked.resource_id === null || blocked.resource_id === undefined
    : blocked.resource_id === null || blocked.resource_id === undefined;
  return providerOk && resourceOk;
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
  
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  
  // Get all appointments for the day
  const appointmentFilter: Record<string, any> = {
    user_id: userId,
    tenant_id: tenantId,
    status: 'scheduled',
    start_time: {
      $gte: dayStart.toISOString(),
      $lt: dayEnd.toISOString(),
    },
  };
  if (options.providerId) {
    appointmentFilter.provider_id = options.providerId;
  }
  if (options.resourceId) {
    appointmentFilter.resource_id = options.resourceId;
  }

  const appointments = await db
    .collection('appointments')
    .find(appointmentFilter)
    .toArray();

  const bookedSlots = appointments.map((row: any) => ({
    start: new Date(row.start_time),
    end: new Date(row.end_time),
  }));
  const blockedTimes = await db.collection('blocked_times').find({ user_id: userId, tenant_id: tenantId }).toArray();

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
      const isAvailable = !bookedSlots.some((booked: any) => {
        return (
          (slotStart >= booked.start && slotStart < booked.end) ||
          (slotEnd > booked.start && slotEnd <= booked.end) ||
          (slotStart <= booked.start && slotEnd >= booked.end)
        );
      }) && !blockedTimes.some((blocked: any) => {
        if (!appliesToScope(blocked, options)) return false;
        const blockedStart = toDate(blocked.start_time);
        const blockedEnd = toDate(blocked.end_time);
        if (!blockedStart || !blockedEnd) return false;
        return doTimeSlotsOverlap(slotStart, slotEnd, blockedStart, blockedEnd);
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
  const today = new Date();

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    
    const slots = await getAvailableSlots(userId, tenantId, date, serviceDuration, { start: '09:00', end: '18:00' }, options);
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
  tenantId: ObjectId,
  startTime: Date,
  endTime: Date,
  options: SlotFilterOptions = {}
): Promise<boolean> {
  const db = await getMongoDbOrThrow();
  
  // Calculate search window: check appointments on the same day
  // This ensures we catch all potentially overlapping appointments without complex SQL
  const searchWindowStart = new Date(startTime);
  searchWindowStart.setHours(0, 0, 0, 0); // Start of day
  
  const searchWindowEnd = new Date(endTime);
  searchWindowEnd.setHours(23, 59, 59, 999); // End of day
  
  // Fetch all scheduled appointments for this user on the same day(s)
  // Using simple WHERE conditions: user_id, status, and date range
  // No complex OR conditions that might have parsing issues
  const appointmentFilter: Record<string, any> = {
    user_id: userId,
    tenant_id: tenantId,
    status: 'scheduled',
    start_time: {
      $gte: searchWindowStart.toISOString(),
      $lte: searchWindowEnd.toISOString(),
    },
  };
  if (options.providerId) {
    appointmentFilter.provider_id = options.providerId;
  }
  if (options.resourceId) {
    appointmentFilter.resource_id = options.resourceId;
  }

  const appointments = await db
    .collection('appointments')
    .find(appointmentFilter)
    .toArray();
  
  // Also check appointments that start on previous days but end during our window
  // This catches appointments that span multiple days or start before our window
  if (searchWindowStart.getTime() !== searchWindowEnd.getTime()) {
    const dayBeforeStart = new Date(searchWindowStart);
    dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
    dayBeforeStart.setHours(0, 0, 0, 0);
    
    const extraFilter: Record<string, any> = {
      user_id: userId,
      tenant_id: tenantId,
      status: 'scheduled',
      start_time: {
        $gte: dayBeforeStart.toISOString(),
        $lt: searchWindowStart.toISOString(),
      },
      end_time: {
        $gte: searchWindowStart.toISOString(),
      },
    };
    if (options.providerId) {
      extraFilter.provider_id = options.providerId;
    }
    if (options.resourceId) {
      extraFilter.resource_id = options.resourceId;
    }

    const extraAppointments = await db
      .collection('appointments')
      .find(extraFilter)
      .toArray();

    appointments.push(...extraAppointments);
  }

  // Remove duplicates by converting to a Set using a unique key
  const uniqueAppointments: any[] = Array.from(
    new Map(appointments.map((apt: any) => [`${apt.start_time}-${apt.end_time}`, apt])).values()
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

  const blockedTimes = await db.collection('blocked_times').find({ user_id: userId, tenant_id: tenantId }).toArray();
  for (const blocked of blockedTimes) {
    if (!appliesToScope(blocked, options)) continue;
    const blockedStart = toDate(blocked.start_time);
    const blockedEnd = toDate(blocked.end_time);
    if (!blockedStart || !blockedEnd) continue;
    if (doTimeSlotsOverlap(startTime, endTime, blockedStart, blockedEnd)) {
      return false;
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

