import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from './db/mongo-utils';

export const DEFAULT_TIME_ZONE = 'Europe/Bucharest';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

type WeekdayKey =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

export interface TimeZoneDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: WeekdayKey;
  dateKey: string;
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cacheKey = timeZone || DEFAULT_TIME_ZONE;
  let formatter = formatterCache.get(cacheKey);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: cacheKey,
      weekday: 'long',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(cacheKey, formatter);
  }
  return formatter;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export async function getTenantTimeZone(tenantId: ObjectId): Promise<string> {
  const db = await getMongoDbOrThrow();
  const tenant = await db.collection('tenants').findOne(
    { _id: tenantId },
    { projection: { 'settings.timezone': 1 } }
  );
  const candidate = typeof tenant?.settings?.timezone === 'string'
    ? tenant.settings.timezone.trim()
    : '';
  return candidate && isValidTimeZone(candidate) ? candidate : DEFAULT_TIME_ZONE;
}

function getTimeZoneDateParts(date: Date, timeZone: string): TimeZoneDateParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const values = new Map<string, string>();
  for (const part of parts) {
    if (part.type !== 'literal') {
      values.set(part.type, part.value);
    }
  }

  const year = Number(values.get('year') || 0);
  const month = Number(values.get('month') || 0);
  const day = Number(values.get('day') || 0);
  const hour = Number(values.get('hour') || 0);
  const minute = Number(values.get('minute') || 0);
  const second = Number(values.get('second') || 0);
  const weekday = (values.get('weekday') || 'monday').toLowerCase() as WeekdayKey;
  const dateKey = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return { year, month, day, hour, minute, second, weekday, dateKey };
}

export function getTimeZoneDateKey(date: Date, timeZone: string): string {
  return getTimeZoneDateParts(date, timeZone).dateKey;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10));
  const shifted = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  const shiftedYear = shifted.getUTCFullYear();
  const shiftedMonth = shifted.getUTCMonth() + 1;
  const shiftedDay = shifted.getUTCDate();
  return `${String(shiftedYear).padStart(4, '0')}-${String(shiftedMonth).padStart(2, '0')}-${String(shiftedDay).padStart(2, '0')}`;
}

export function buildDateInTimeZone(
  dateKey: string,
  timeZone: string,
  hour: number,
  minute: number,
  second: number = 0
): Date {
  const [year, month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10));
  const targetClockTime = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let candidateMs = targetClockTime;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const parts = getTimeZoneDateParts(new Date(candidateMs), timeZone);
    const actualClockTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0
    );
    const diff = targetClockTime - actualClockTime;
    if (diff === 0) {
      return new Date(candidateMs);
    }
    candidateMs += diff;
  }

  return new Date(candidateMs);
}

export function getDayBoundsInTimeZone(
  date: Date,
  timeZone: string
): { start: Date; end: Date; dateKey: string } {
  const dateKey = getTimeZoneDateKey(date, timeZone);
  const start = buildDateInTimeZone(dateKey, timeZone, 0, 0, 0);
  const nextDayStart = buildDateInTimeZone(addDaysToDateKey(dateKey, 1), timeZone, 0, 0, 0);
  return {
    start,
    end: new Date(nextDayStart.getTime() - 1),
    dateKey,
  };
}

export function getDateKeysForIntervalInTimeZone(
  start: Date,
  end: Date,
  timeZone: string
): string[] {
  const normalizedEnd = end.getTime() > start.getTime()
    ? new Date(end.getTime() - 1)
    : end;
  const lastDateKey = getTimeZoneDateKey(normalizedEnd, timeZone);
  const keys: string[] = [];
  let currentDateKey = getTimeZoneDateKey(start, timeZone);

  while (true) {
    keys.push(currentDateKey);
    if (currentDateKey === lastDateKey) {
      return keys;
    }
    currentDateKey = addDaysToDateKey(currentDateKey, 1);
  }
}
