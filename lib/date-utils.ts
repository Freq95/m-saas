/**
 * Date utility functions
 * Standardizes date handling across the application
 */

import { format, parseISO, isValid, startOfDay, endOfDay, subDays } from 'date-fns';
import { DATE_FORMAT, DATETIME_FORMAT } from './constants';

/**
 * Convert a date to UTC ISO string
 */
export function toUTCString(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  
  const dateObj = date instanceof Date ? date : parseISO(date);
  if (!isValid(dateObj)) return null;
  
  return dateObj.toISOString();
}

/**
 * Convert UTC string to Date object
 */
export function fromUTCString(utcString: string | null | undefined): Date | null {
  if (!utcString) return null;
  
  try {
    const date = parseISO(utcString);
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
}

/**
 * Format date to ISO string (UTC)
 */
export function formatLocalDate(date: Date | string | null | undefined, formatStr: string = DATE_FORMAT): string | null {
  if (!date) return null;
  
  const dateObj = date instanceof Date ? date : parseISO(date);
  if (!isValid(dateObj)) return null;
  
  try {
    return format(dateObj, formatStr);
  } catch {
    return null;
  }
}

/**
 * Format datetime to ISO string
 */
export function formatLocalDateTime(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const dateObj = date instanceof Date ? date : parseISO(date);
  if (!isValid(dateObj)) return null;
  return dateObj.toISOString();
}

/**
 * Get start of day in UTC
 */
export function getStartOfDayUTC(date: Date | string = new Date()): Date {
  const dateObj = date instanceof Date ? date : parseISO(date);
  const localStart = startOfDay(dateObj);
  return new Date(localStart.toISOString());
}

/**
 * Get end of day in UTC
 */
export function getEndOfDayUTC(date: Date | string = new Date()): Date {
  const dateObj = date instanceof Date ? date : parseISO(date);
  const localEnd = endOfDay(dateObj);
  return new Date(localEnd.toISOString());
}

/**
 * Get date range for last N days
 */
export function getDateRange(days: number): { start: Date; end: Date } {
  const end = new Date();
  const start = subDays(end, days - 1);
  return {
    start: getStartOfDayUTC(start),
    end: getEndOfDayUTC(end),
  };
}

/**
 * Safe date parsing with validation
 */
export function safeParseDate(value: unknown): Date | null {
  if (!value) return null;
  
  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }
  
  if (typeof value === 'string') {
    try {
      const date = parseISO(value);
      return isValid(date) ? date : null;
    } catch {
      return null;
    }
  }
  
  if (typeof value === 'number') {
    const date = new Date(value);
    return isValid(date) ? date : null;
  }
  
  return null;
}

/**
 * Format date for display (Romanian locale)
 */
export function formatDisplayDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  
  const dateObj = safeParseDate(date);
  if (!dateObj) return '';
  
  try {
    return format(dateObj, 'dd.MM.yyyy');
  } catch {
    return '';
  }
}

/**
 * Format datetime for display
 */
export function formatDisplayDateTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  
  const dateObj = safeParseDate(date);
  if (!dateObj) return '';
  
  try {
    return format(dateObj, 'dd.MM.yyyy HH:mm');
  } catch {
    return '';
  }
}

