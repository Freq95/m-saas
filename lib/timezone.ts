import { zonedTimeToUtc, utcToZonedTime, format } from 'date-fns-tz';

const ROMANIA_TIMEZONE = 'Europe/Bucharest';

/**
 * Get today's date in Romania timezone (start of day)
 * Returns a Date object representing the start of today in Romania timezone (as UTC)
 */
export function getTodayInRomania(): Date {
  const now = new Date();
  // Convert current UTC time to Romania timezone
  const romaniaTime = utcToZonedTime(now, ROMANIA_TIMEZONE);
  
  // Set to start of day (00:00:00) in Romania timezone
  const todayStart = new Date(romaniaTime);
  todayStart.setHours(0, 0, 0, 0);
  
  // Convert back to UTC for database comparison
  // This gives us the UTC timestamp that represents 00:00:00 in Romania
  return zonedTimeToUtc(todayStart, ROMANIA_TIMEZONE);
}

/**
 * Check if a date is today in Romania timezone
 */
export function isTodayInRomania(date: Date): boolean {
  if (!date || isNaN(date.getTime())) {
    return false;
  }
  
  const todayStart = getTodayInRomania();
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  
  // Check if date is >= today start and < tomorrow start
  return date.getTime() >= todayStart.getTime() && date.getTime() < tomorrowStart.getTime();
}

/**
 * Format date in Romania timezone
 */
export function formatInRomania(date: Date, formatStr: string): string {
  return format(utcToZonedTime(date, ROMANIA_TIMEZONE), formatStr, {
    timeZone: ROMANIA_TIMEZONE,
  });
}

