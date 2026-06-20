import { createHash, randomUUID } from 'crypto';
import { ObjectId, type Db } from 'mongodb';
import type { AuthContext } from '@/lib/auth-helpers';
import { AuthError, isClinicalRole } from '@/lib/auth-helpers';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { getCalendarAuth, requireCalendarPermission } from '@/lib/calendar-auth';
import { buildAppointmentDentistFields, resolveAppointmentDentistAssignment, type AppointmentDentistAssignment } from '@/lib/appointment-service';
import { checkAppointmentConflict } from '@/lib/calendar-conflicts';
import { hasAvailabilityBlockConflict } from '@/lib/appointment-conflict-response';
import { resolveAppointmentClientLink } from '@/app/api/appointments/client-linking';
import { linkAppointmentToClient } from '@/lib/client-matching';
import { invalidateReadCaches } from '@/lib/cache-keys';

const SOURCE = 'google_calendar_ics';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EVENTS = 1000;
const MAX_IMPORTABLE_ROWS = 500;
const PREVIEW_TTL_MS = 60 * 60 * 1000;
const DEFAULT_SERVICE_NAME = 'Eveniment importat';

export interface CalendarImportOptions {
  calendarId: number;
  dentistUserId?: number | null;
  dateRangeStart?: string | null;
  dateRangeEnd?: string | null;
  recurrenceHorizonMonths: number;
  includeOverlaps: boolean;
  includePrivate: boolean;
  duplicateStrategy: 'skip';
  placeholderServiceName: string;
}

export interface CalendarImportRowOverride {
  clientName?: string;
  notes?: string;
}

export interface CalendarImportRow {
  id: string;
  externalUid: string;
  externalInstanceKey: string;
  title: string;
  clientName: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  sourceCalendarName: string | null;
  originalTimezone: string | null;
  rawSummary: string | null;
  rawLocation: string | null;
  description: string | null;
  attendeeSummary: string | null;
  organizerSummary: string | null;
  isPrivate: boolean;
  isRecurring: boolean;
  isAllDay: boolean;
  invalidReason: string | null;
  duplicate: boolean;
  hasOverlap: boolean;
  hasAvailabilityBlock: boolean;
  projectedAction: CalendarImportProjectedAction;
}

export type CalendarImportProjectedAction =
  | 'import'
  | 'skip_duplicate'
  | 'skip_conflict'
  | 'skip_private'
  | 'invalid'
  | 'deselected';

export interface CalendarImportOutcome {
  willImport: number;
  willSkipDuplicates: number;
  willSkipConflicts: number;
  willSkipPrivate: number;
  invalidOrIncomplete: number;
  recurringInstancesExpanded: number;
  alreadyDeselected: number;
  failedRisk: number;
}

export interface CalendarImportPreviewDoc {
  _id: string;
  tenant_id: ObjectId;
  actor_db_user_id: ObjectId;
  actor_user_id: number;
  appointment_user_id: number;
  appointment_tenant_id: ObjectId;
  calendar_id: number;
  dentist_user_id: number;
  dentist_tenant_id: ObjectId;
  rows: CalendarImportRow[];
  options: CalendarImportOptions;
  created_at: string;
  expires_at: Date;
}

interface ImportScope {
  appointmentUserId: number;
  appointmentTenantId: ObjectId;
  calendarId: number;
  dentistAssignment: AppointmentDentistAssignment;
}

function toText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value && 'val' in value) {
    return toText((value as { val?: unknown }).val);
  }
  return String(value);
}

function sanitizeClientName(value: string | null | undefined): string {
  const name = (value || '').replace(/\s+/g, ' ').trim();
  return name || DEFAULT_SERVICE_NAME;
}

function normalizeOptions(raw: unknown): CalendarImportOptions {
  const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const calendarId = Number(value.calendarId);
  const dentistUserId = value.dentistUserId === null || value.dentistUserId === undefined || value.dentistUserId === ''
    ? null
    : Number(value.dentistUserId);
  const recurrenceHorizonMonths = Math.min(
    24,
    Math.max(1, Number(value.recurrenceHorizonMonths || 12))
  );

  if (!Number.isInteger(calendarId) || calendarId <= 0) {
    throw new AuthError('Calendar invalid pentru import.', 400);
  }
  if (dentistUserId !== null && (!Number.isInteger(dentistUserId) || dentistUserId <= 0)) {
    throw new AuthError('Medic invalid pentru import.', 400);
  }

  return {
    calendarId,
    dentistUserId,
    dateRangeStart: typeof value.dateRangeStart === 'string' && value.dateRangeStart ? value.dateRangeStart : null,
    dateRangeEnd: typeof value.dateRangeEnd === 'string' && value.dateRangeEnd ? value.dateRangeEnd : null,
    recurrenceHorizonMonths,
    includeOverlaps: Boolean(value.includeOverlaps),
    includePrivate: Boolean(value.includePrivate),
    duplicateStrategy: 'skip',
    placeholderServiceName: sanitizeClientName(
      typeof value.placeholderServiceName === 'string' ? value.placeholderServiceName : DEFAULT_SERVICE_NAME
    ),
  };
}

export function parseImportOptions(raw: unknown): CalendarImportOptions {
  return normalizeOptions(raw);
}

export function parseSelectedRowIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export function parseRowOverrides(raw: unknown): Record<string, CalendarImportRowOverride> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, CalendarImportRowOverride> = {};
  for (const [rowId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const override = value as Record<string, unknown>;
    out[rowId] = {
      clientName: typeof override.clientName === 'string' ? override.clientName : undefined,
      notes: typeof override.notes === 'string' ? override.notes : undefined,
    };
  }
  return out;
}

export async function resolveImportScope(auth: AuthContext, options: CalendarImportOptions): Promise<ImportScope> {
  if (!isClinicalRole(auth.role) || auth.role === 'super_admin') {
    throw new AuthError('Importul calendarului este disponibil doar pentru owner și medici.', 403);
  }
  const calendarAuth = await getCalendarAuth(auth, options.calendarId);
  requireCalendarPermission(calendarAuth, 'can_create');
  const dentistAssignment = await resolveAppointmentDentistAssignment(auth, options.calendarId, options.dentistUserId);

  return {
    appointmentUserId: calendarAuth.calendarOwnerId,
    appointmentTenantId: calendarAuth.calendarTenantId,
    calendarId: calendarAuth.calendarId,
    dentistAssignment,
  };
}

async function extractIcsTexts(file: File): Promise<Array<{ name: string; text: string }>> {
  if (file.size > MAX_FILE_BYTES) {
    throw new AuthError('Fișierul este prea mare pentru import.', 400);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.zip') || file.type.includes('zip')) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(bytes).catch(() => {
      throw new AuthError('Arhiva .zip nu poate fi citită. Re-exporta calendarul și încearcă din nou.', 400);
    });
    const entries = Object.values(zip.files).filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.ics'));
    if (entries.length === 0) {
      throw new AuthError('Arhiva nu conține fișiere .ics.', 400);
    }
    return Promise.all(entries.map(async (entry) => ({
      name: entry.name,
      text: await entry.async('string'),
    })));
  }

  if (!lowerName.endsWith('.ics') && !file.type.includes('calendar')) {
    throw new AuthError('Încarcă un fișier .ics sau o arhiva .zip cu fișiere .ics.', 400);
  }

  return [{ name: file.name, text: bytes.toString('utf8') }];
}

function getRange(options: CalendarImportOptions): { from: Date; to: Date } {
  const now = new Date();
  const from = options.dateRangeStart ? new Date(options.dateRangeStart) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = options.dateRangeEnd ? new Date(options.dateRangeEnd) : new Date(now);
  if (!options.dateRangeEnd) {
    to.setMonth(to.getMonth() + options.recurrenceHorizonMonths);
  }
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new AuthError('Intervalul de import este invalid.', 400);
  }
  return { from, to };
}

function buildExternalInstanceKey(uid: string, start: Date, recurrenceId?: unknown): string {
  const recurrence = recurrenceId ? toText(recurrenceId) : '';
  return `${uid}:${recurrence || start.toISOString()}`;
}

function buildRowId(uid: string, start: Date, fileName: string): string {
  return createHash('sha1').update(`${fileName}:${uid}:${start.toISOString()}`).digest('hex');
}

function buildNotes(row: CalendarImportRow, override?: CalendarImportRowOverride): string | null {
  if (override?.notes !== undefined) {
    const trimmed = override.notes.trim();
    return trimmed || null;
  }
  const lines = [
    row.description,
    row.rawLocation ? `Locatie: ${row.rawLocation}` : null,
    row.organizerSummary ? `Organizator: ${row.organizerSummary}` : null,
    row.attendeeSummary ? `Participanti: ${row.attendeeSummary}` : null,
    `Import ICS: ${row.externalUid}`,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}

interface SimpleIcsEvent {
  uid: string;
  summary: string;
  description: string | null;
  location: string | null;
  start: Date | null;
  end: Date | null;
  timezone: string | null;
  className: string | null;
  attendees: string[];
  organizer: string | null;
  rrule: string | null;
  recurrenceId: string | null;
  exdates: string[];
  allDay: boolean;
}

interface ParsedIcsFile {
  calendarName: string | null;
  calendarTimezone: string | null;
  events: SimpleIcsEvent[];
}

function unfoldIcsLines(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.trim()) {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseIcsProperty(line: string): { name: string; params: Record<string, string>; value: string } | null {
  const colonIndex = line.indexOf(':');
  if (colonIndex < 0) return null;
  const left = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const [rawName, ...rawParams] = left.split(';');
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const eq = param.indexOf('=');
    if (eq > 0) {
      params[param.slice(0, eq).toUpperCase()] = param.slice(eq + 1).replace(/^"|"$/g, '');
    }
  }
  return {
    name: rawName.toUpperCase(),
    params,
    value,
  };
}

function parseIcsDate(value: string, params: Record<string, string>): { date: Date | null; allDay: boolean; timezone: string | null } {
  const trimmed = value.trim();
  const timezone = params.TZID || null;
  const allDay = params.VALUE === 'DATE' || /^\d{8}$/.test(trimmed);
  const match = trimmed.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) return { date: null, allDay, timezone };
  const [, year, month, day, hour = '0', minute = '0', second = '0', zulu] = match;
  const timestamp = zulu || timezone
    ? Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))
    : Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return { date: new Date(timestamp), allDay, timezone };
}

function parseIcsText(text: string): ParsedIcsFile {
  const lines = unfoldIcsLines(text);
  const events: SimpleIcsEvent[] = [];
  let calendarName: string | null = null;
  let calendarTimezone: string | null = null;
  let current: SimpleIcsEvent | null = null;

  for (const line of lines) {
    const prop = parseIcsProperty(line);
    if (!prop) continue;
    if (prop.name === 'BEGIN' && prop.value.toUpperCase() === 'VEVENT') {
      current = {
        uid: '',
        summary: '',
        description: null,
        location: null,
        start: null,
        end: null,
        timezone: null,
        className: null,
        attendees: [],
        organizer: null,
        rrule: null,
        recurrenceId: null,
        exdates: [],
        allDay: false,
      };
      continue;
    }
    if (prop.name === 'END' && prop.value.toUpperCase() === 'VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }

    if (!current) {
      if (prop.name === 'X-WR-CALNAME') calendarName = unescapeIcsText(prop.value);
      if (prop.name === 'X-WR-TIMEZONE') calendarTimezone = unescapeIcsText(prop.value);
      continue;
    }

    if (prop.name === 'UID') current.uid = unescapeIcsText(prop.value);
    if (prop.name === 'SUMMARY') current.summary = unescapeIcsText(prop.value);
    if (prop.name === 'DESCRIPTION') current.description = unescapeIcsText(prop.value) || null;
    if (prop.name === 'LOCATION') current.location = unescapeIcsText(prop.value) || null;
    if (prop.name === 'CLASS') current.className = unescapeIcsText(prop.value) || null;
    if (prop.name === 'RRULE') current.rrule = prop.value.trim() || null;
    if (prop.name === 'ORGANIZER') current.organizer = unescapeIcsText(prop.params.CN || prop.value.replace(/^mailto:/i, '')) || null;
    if (prop.name === 'ATTENDEE') current.attendees.push(unescapeIcsText(prop.params.CN || prop.value.replace(/^mailto:/i, '')));
    if (prop.name === 'RECURRENCE-ID') current.recurrenceId = prop.value.trim() || null;
    if (prop.name === 'EXDATE') current.exdates.push(...prop.value.split(',').map((item) => item.trim()).filter(Boolean));
    if (prop.name === 'DTSTART') {
      const parsed = parseIcsDate(prop.value, prop.params);
      current.start = parsed.date;
      current.timezone = parsed.timezone || current.timezone;
      current.allDay = parsed.allDay;
    }
    if (prop.name === 'DTEND') {
      const parsed = parseIcsDate(prop.value, prop.params);
      current.end = parsed.date;
      current.timezone = parsed.timezone || current.timezone;
    }
  }

  return { calendarName, calendarTimezone, events };
}

function parseRRule(rrule: string): Record<string, string> {
  return Object.fromEntries(
    rrule.split(';')
      .map((part) => part.split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key.toUpperCase(), value])
  );
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function expandSimpleRecurrence(event: SimpleIcsEvent, from: Date, to: Date): Array<{ start: Date; end: Date | null; recurrenceId: string }> {
  if (!event.start || !event.rrule) return [];
  const rule = parseRRule(event.rrule);
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL || 1));
  const count = rule.COUNT ? Math.max(1, Number(rule.COUNT)) : null;
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL, {}).date : null;
  const duration = event.end ? event.end.getTime() - event.start.getTime() : 30 * 60 * 1000;
  const exdates = new Set(
    event.exdates
      .map((value) => parseIcsDate(value, {}).date?.toISOString())
      .filter((value): value is string => Boolean(value))
  );
  const instances: Array<{ start: Date; end: Date | null; recurrenceId: string }> = [];
  const limit = new Date(Math.min(to.getTime(), until?.getTime() ?? to.getTime()));

  if (freq === 'DAILY' || freq === 'MONTHLY') {
    let current = new Date(event.start);
    let emitted = 0;
    while (current <= limit && instances.length < MAX_EVENTS && (!count || emitted < count)) {
      const currentIso = current.toISOString();
      if (current >= from && !exdates.has(currentIso)) {
        instances.push({ start: new Date(current), end: new Date(current.getTime() + duration), recurrenceId: currentIso });
      }
      emitted += 1;
      current = freq === 'DAILY'
        ? new Date(current.getTime() + interval * 24 * 60 * 60 * 1000)
        : addMonths(current, interval);
    }
    return instances;
  }

  if (freq === 'WEEKLY') {
    const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const byDays = (rule.BYDAY || '').split(',').map((day) => dayMap[day]).filter((day): day is number => typeof day === 'number');
    const allowedDays = byDays.length > 0 ? new Set(byDays) : new Set([event.start.getUTCDay()]);
    let current = new Date(event.start);
    let emitted = 0;
    while (current <= limit && instances.length < MAX_EVENTS && (!count || emitted < count)) {
      const weeksSinceStart = Math.floor((current.getTime() - event.start.getTime()) / (7 * 24 * 60 * 60 * 1000));
      const currentIso = current.toISOString();
      if (weeksSinceStart % interval === 0 && allowedDays.has(current.getUTCDay())) {
        emitted += 1;
        if (current >= from && !exdates.has(currentIso)) {
          instances.push({ start: new Date(current), end: new Date(current.getTime() + duration), recurrenceId: currentIso });
        }
      }
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  return instances;
}

function normalizeEventInstance(args: {
  event: SimpleIcsEvent;
  start: Date;
  end: Date | null;
  fileName: string;
  sourceCalendarName: string | null;
  calendarTimezone: string | null;
  isRecurring: boolean;
  isAllDay: boolean;
  recurrenceId?: string | null;
  placeholderName: string;
}): CalendarImportRow {
  const { event, start, fileName, sourceCalendarName, calendarTimezone, isRecurring, isAllDay, placeholderName } = args;
  const uid = String(event.uid || buildRowId(event.summary, start, fileName));
  const end = args.end && !Number.isNaN(args.end.getTime())
    ? args.end
    : new Date(start.getTime() + 30 * 60 * 1000);
  const rawSummary = event.summary.trim();
  const isPrivate = String(event.className || '').toUpperCase() === 'PRIVATE' || String(event.className || '').toUpperCase() === 'CONFIDENTIAL';
  // Empty/private summaries fall back to the user's configured placeholder
  // (defaults to "Eveniment importat"). This keeps the row's clientName
  // consistent with the placeholderServiceName option the user already
  // chose, instead of injecting a separate "Eveniment privat" literal.
  const title = sanitizeClientName(rawSummary || placeholderName);
  const location = event.location?.trim() || '';
  const description = event.description?.trim() || '';
  const attendeeSummary = event.attendees.filter(Boolean).join(', ') || null;
  const organizerSummary = event.organizer?.trim() || null;
  const invalidReason = start >= end ? 'Interval invalid' : null;
  const externalInstanceKey = buildExternalInstanceKey(uid, start, args.recurrenceId || event.recurrenceId);

  return {
    id: buildRowId(uid, start, fileName),
    externalUid: uid,
    externalInstanceKey,
    title,
    clientName: title,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    durationMinutes: Math.max(1, Math.round((end.getTime() - start.getTime()) / 60000)),
    sourceCalendarName,
    originalTimezone: event.timezone || calendarTimezone,
    rawSummary: rawSummary || null,
    rawLocation: location || null,
    description: description || null,
    attendeeSummary,
    organizerSummary,
    isPrivate,
    isRecurring,
    isAllDay,
    invalidReason,
    duplicate: false,
    hasOverlap: false,
    hasAvailabilityBlock: false,
    projectedAction: 'import',
  };
}

export async function parseRowsFromImportFile(file: File, options: CalendarImportOptions): Promise<{ rows: CalendarImportRow[]; recurringExpanded: number }> {
  const files = await extractIcsTexts(file);
  const { from, to } = getRange(options);
  const rows: CalendarImportRow[] = [];
  let recurringExpanded = 0;

  for (const icsFile of files) {
    const parsed = (() => {
      try {
        return parseIcsText(icsFile.text);
      } catch {
        throw new AuthError(`Fișierul ICS "${icsFile.name}" nu poate fi citit. Verifică exportul Google Calendar.`, 400);
      }
    })();
    const calendarName = parsed.calendarName;
    const calendarTimezone = parsed.calendarTimezone;

    for (const event of parsed.events) {
      if (event.recurrenceId) continue;

      if (event.rrule) {
        const instances = expandSimpleRecurrence(event, from, to);
        recurringExpanded += Math.max(0, instances.length - 1);
        for (const instance of instances) {
          const start = new Date(instance.start);
          const end = instance.end ? new Date(instance.end) : null;
          if (start < from || start > to) continue;
          rows.push(normalizeEventInstance({
            event,
            start,
            end,
            fileName: icsFile.name,
            sourceCalendarName: calendarName,
            calendarTimezone,
            isRecurring: true,
            isAllDay: event.allDay,
            recurrenceId: instance.recurrenceId,
            placeholderName: options.placeholderServiceName,
          }));
        }
      } else {
        const start = event.start ? new Date(event.start) : null;
        if (!start || Number.isNaN(start.getTime()) || start < from || start > to) continue;
        rows.push(normalizeEventInstance({
          event,
          start,
          end: event.end ? new Date(event.end) : null,
          fileName: icsFile.name,
          sourceCalendarName: calendarName,
          calendarTimezone,
          isRecurring: false,
          isAllDay: event.allDay,
          placeholderName: options.placeholderServiceName,
        }));
      }

      if (rows.length > MAX_EVENTS) {
        throw new AuthError(`Fișierul conține peste ${MAX_EVENTS} evenimente. Restrânge intervalul de import.`, 400);
      }
    }
  }

  rows.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return { rows: rows.slice(0, MAX_IMPORTABLE_ROWS), recurringExpanded };
}

async function refreshRowState(rows: CalendarImportRow[], scope: ImportScope): Promise<CalendarImportRow[]> {
  const db = await getMongoDbOrThrow();
  const keys = rows.map((row) => row.externalInstanceKey);
  const duplicateDocs = keys.length > 0
    ? await db.collection('appointments').find(
        {
          tenant_id: scope.appointmentTenantId,
          user_id: scope.appointmentUserId,
          source: SOURCE,
          external_instance_key: { $in: keys },
          deleted_at: { $exists: false },
        },
        { projection: { external_instance_key: 1 } }
      ).toArray()
    : [];
  const duplicateKeys = new Set(duplicateDocs.map((doc: any) => String(doc.external_instance_key)));

  const refreshed: CalendarImportRow[] = [];
  for (const row of rows) {
    const start = new Date(row.startTime);
    const end = new Date(row.endTime);
    let hasOverlap = false;
    let hasAvailabilityBlock = false;
    if (!row.invalidReason && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const conflicts = await checkAppointmentConflict(
        scope.appointmentUserId,
        scope.appointmentTenantId,
        start,
        end,
        undefined,
        false,
        {
          calendarId: scope.calendarId,
          dentistUserId: scope.dentistAssignment.assignedDentistUserId,
          dentistTenantId: scope.dentistAssignment.assignedDentistTenantId,
        }
      );
      hasAvailabilityBlock = hasAvailabilityBlockConflict(conflicts.conflicts);
      hasOverlap = conflicts.conflicts.some((conflict: any) => conflict?.type === 'calendar_appointment' || conflict?.type === 'appointment_overlap');
    }
    refreshed.push({
      ...row,
      duplicate: duplicateKeys.has(row.externalInstanceKey),
      hasOverlap,
      hasAvailabilityBlock,
      projectedAction: 'import',
    });
  }
  return refreshed;
}

export function applyProjectedActions(
  rows: CalendarImportRow[],
  options: CalendarImportOptions,
  selectedRowIds: string[],
  overrides: Record<string, CalendarImportRowOverride> = {}
): { rows: CalendarImportRow[]; outcome: CalendarImportOutcome } {
  const selected = new Set(selectedRowIds);
  const outcome: CalendarImportOutcome = {
    willImport: 0,
    willSkipDuplicates: 0,
    willSkipConflicts: 0,
    willSkipPrivate: 0,
    invalidOrIncomplete: 0,
    recurringInstancesExpanded: rows.filter((row) => row.isRecurring).length,
    alreadyDeselected: 0,
    failedRisk: 0,
  };
  const projectedRows = rows.map((row) => {
    let projectedAction: CalendarImportProjectedAction = 'import';
    const override = overrides[row.id];
    const clientName = sanitizeClientName(override?.clientName ?? row.clientName);
    // Classify by REASON first, so a duplicate / private / conflict / invalid
    // row counts towards its specific outcome bucket even if it's been
    // preselected-off. Otherwise the UI shows "0 duplicates" but treats the
    // row as "Neselectat" — losing the explanation for why it's skipped.
    if (row.invalidReason || !clientName) {
      projectedAction = 'invalid';
      outcome.invalidOrIncomplete += 1;
    } else if (row.isPrivate && !options.includePrivate) {
      projectedAction = 'skip_private';
      outcome.willSkipPrivate += 1;
    } else if (row.duplicate) {
      projectedAction = 'skip_duplicate';
      outcome.willSkipDuplicates += 1;
    } else if (row.hasAvailabilityBlock || (row.hasOverlap && !options.includeOverlaps)) {
      projectedAction = 'skip_conflict';
      outcome.willSkipConflicts += 1;
    } else if (!selected.has(row.id)) {
      projectedAction = 'deselected';
      outcome.alreadyDeselected += 1;
    } else {
      outcome.willImport += 1;
    }
    return {
      ...row,
      clientName,
      projectedAction,
    };
  });
  return { rows: projectedRows, outcome };
}

export async function createImportPreview(auth: AuthContext, file: File, rawOptions: unknown) {
  const options = normalizeOptions(rawOptions);
  const scope = await resolveImportScope(auth, options);
  const parsed = await parseRowsFromImportFile(file, options);
  const rowsWithState = await refreshRowState(parsed.rows, scope);
  const defaultSelected = rowsWithState
    .filter((row) => !row.invalidReason && (!row.isPrivate || options.includePrivate) && !row.duplicate && !row.hasAvailabilityBlock && (!row.hasOverlap || options.includeOverlaps))
    .map((row) => row.id);
  const projected = applyProjectedActions(rowsWithState, options, defaultSelected);
  projected.outcome.recurringInstancesExpanded = parsed.recurringExpanded;

  const previewId = randomUUID();
  const now = new Date();
  const doc: CalendarImportPreviewDoc = {
    _id: previewId,
    tenant_id: auth.tenantId,
    actor_db_user_id: auth.dbUserId,
    actor_user_id: auth.userId,
    appointment_user_id: scope.appointmentUserId,
    appointment_tenant_id: scope.appointmentTenantId,
    calendar_id: scope.calendarId,
    dentist_user_id: scope.dentistAssignment.assignedDentistUserId,
    dentist_tenant_id: scope.dentistAssignment.assignedDentistTenantId,
    rows: rowsWithState,
    options,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + PREVIEW_TTL_MS),
  };
  const db = await getMongoDbOrThrow();
  await ensureCalendarImportIndexes(db);
  await db.collection<CalendarImportPreviewDoc>('calendar_import_previews').insertOne(doc);

  return {
    previewId,
    rows: projected.rows,
    selectedRowIds: defaultSelected,
    outcome: projected.outcome,
    options,
  };
}

export async function loadImportPreview(auth: AuthContext, previewId: string): Promise<CalendarImportPreviewDoc> {
  const db = await getMongoDbOrThrow();
  const preview = await db.collection<CalendarImportPreviewDoc>('calendar_import_previews').findOne({
    _id: previewId,
    tenant_id: auth.tenantId,
    actor_db_user_id: auth.dbUserId,
    expires_at: { $gt: new Date() },
  });
  if (!preview) {
    throw new AuthError('Previzualizarea importului a expirat sau nu există.', 404);
  }
  return preview;
}

export async function recalculateImportPreview(
  auth: AuthContext,
  previewId: string,
  rawOptions: unknown,
  selectedRowIds: string[],
  overrides: Record<string, CalendarImportRowOverride>
) {
  const preview = await loadImportPreview(auth, previewId);
  const options = normalizeOptions({ ...preview.options, ...(rawOptions as Record<string, unknown> || {}) });
  const projected = applyProjectedActions(preview.rows, options, selectedRowIds, overrides);
  return { previewId, rows: projected.rows, outcome: projected.outcome, options };
}

async function getOrCreateImportService(db: Db, assignment: AppointmentDentistAssignment, serviceName: string) {
  const name = sanitizeClientName(serviceName || DEFAULT_SERVICE_NAME);
  const existing = await db.collection('services').findOne({
    tenant_id: assignment.assignedDentistTenantId,
    user_id: assignment.assignedDentistUserId,
    name,
    deleted_at: { $exists: false },
  });
  if (existing) return existing;

  const now = new Date().toISOString();
  const serviceId = await getNextNumericId('services');
  const serviceDoc = {
    _id: serviceId,
    id: serviceId,
    tenant_id: assignment.assignedDentistTenantId,
    user_id: assignment.assignedDentistUserId,
    name,
    duration_minutes: 30,
    price: null,
    description: 'Creat automat pentru importuri ICS.',
    is_import_placeholder: true,
    created_at: now,
    updated_at: now,
  };
  await db.collection<FlexDoc>('services').insertOne(serviceDoc);
  return serviceDoc;
}

export async function confirmImportPreview(
  auth: AuthContext,
  previewId: string,
  rawOptions: unknown,
  selectedRowIds: string[],
  overrides: Record<string, CalendarImportRowOverride>
) {
  const preview = await loadImportPreview(auth, previewId);
  const options = normalizeOptions({ ...preview.options, ...(rawOptions as Record<string, unknown> || {}) });
  const scope = await resolveImportScope(auth, options);
  const refreshed = await refreshRowState(preview.rows, scope);
  const projected = applyProjectedActions(refreshed, options, selectedRowIds, overrides);
  const db = await getMongoDbOrThrow();
  await ensureCalendarImportIndexes(db);
  const serviceDoc = await getOrCreateImportService(db, scope.dentistAssignment, options.placeholderServiceName);
  const importBatchId = await getNextNumericId('calendar_import_batches');
  const now = new Date().toISOString();
  const actual = {
    imported: 0,
    skippedDuplicates: 0,
    skippedConflicts: 0,
    skippedPrivate: 0,
    invalid: 0,
    deselected: 0,
    failed: 0,
  };

  await db.collection<FlexDoc>('calendar_import_batches').insertOne({
    _id: importBatchId,
    id: importBatchId,
    tenant_id: auth.tenantId,
    actor_db_user_id: auth.dbUserId,
    actor_user_id: auth.userId,
    user_id: scope.appointmentUserId,
    appointment_user_id: scope.appointmentUserId,
    appointment_tenant_id: scope.appointmentTenantId,
    calendar_id: scope.calendarId,
    source: SOURCE,
    options,
    projected_outcome: projected.outcome,
    status: 'running',
    created_at: now,
    updated_at: now,
  });

  const importedClientIds = new Set<number>();
  for (const row of projected.rows) {
    if (row.projectedAction === 'deselected') {
      actual.deselected += 1;
      continue;
    }
    if (row.projectedAction === 'invalid') {
      actual.invalid += 1;
      continue;
    }
    if (row.projectedAction === 'skip_private') {
      actual.skippedPrivate += 1;
      continue;
    }
    if (row.projectedAction === 'skip_duplicate') {
      actual.skippedDuplicates += 1;
      continue;
    }
    if (row.projectedAction === 'skip_conflict') {
      actual.skippedConflicts += 1;
      continue;
    }

    try {
      const override = overrides[row.id];
      const client = await resolveAppointmentClientLink({
        db,
        userId: scope.dentistAssignment.assignedDentistUserId,
        tenantId: scope.dentistAssignment.assignedDentistTenantId,
        name: sanitizeClientName(override?.clientName ?? row.clientName),
        forceNewClient: false,
      });
      const appointmentId = await getNextNumericId('appointments');
      const serviceName = String(serviceDoc.name || options.placeholderServiceName);
      const appointmentDoc = {
        _id: appointmentId,
        id: appointmentId,
        tenant_id: scope.appointmentTenantId,
        user_id: scope.appointmentUserId,
        calendar_id: scope.calendarId,
        created_by_user_id: auth.dbUserId,
        ...buildAppointmentDentistFields(scope.dentistAssignment),
        conversation_id: null,
        service_ids: [serviceDoc.id],
        service_names_snapshot: [serviceName],
        prices_at_time: [0],
        service_id: serviceDoc.id,
        service_name: serviceName,
        client_id: client.id,
        client_name: client.name || row.clientName,
        client_email: client.email || null,
        client_phone: client.phone || null,
        start_time: row.startTime,
        end_time: row.endTime,
        status: 'scheduled',
        category: null,
        category_label: null,
        category_color: null,
        color: null,
        notes: buildNotes(row, override),
        price_at_time: null,
        reminder_sent: false,
        source: SOURCE,
        external_uid: row.externalUid,
        external_instance_key: row.externalInstanceKey,
        import_batch_id: importBatchId,
        imported_at: now,
        imported_by_user_id: auth.dbUserId,
        import_calendar_name: row.sourceCalendarName,
        original_timezone: row.originalTimezone,
        raw_summary: row.rawSummary,
        raw_location: row.rawLocation,
        created_at: now,
        updated_at: now,
      };
      await db.collection<FlexDoc>('appointments').insertOne(appointmentDoc);
      await linkAppointmentToClient(appointmentId, client.id, scope.appointmentTenantId, scope.dentistAssignment.assignedDentistTenantId);
      importedClientIds.add(client.id);
      actual.imported += 1;
    } catch (error: any) {
      if (error?.code === 11000) {
        actual.skippedDuplicates += 1;
      } else {
        actual.failed += 1;
      }
    }
  }

  await db.collection('calendar_import_batches').updateOne(
    { id: importBatchId, tenant_id: auth.tenantId },
    {
      $set: {
        status: 'completed',
        actual_outcome: actual,
        imported_client_ids: Array.from(importedClientIds),
        updated_at: new Date().toISOString(),
      },
    }
  );
  await db.collection<CalendarImportPreviewDoc>('calendar_import_previews').deleteOne({ _id: previewId });
  await invalidateReadCaches({
    tenantId: scope.appointmentTenantId,
    userId: scope.appointmentUserId,
    calendarId: scope.calendarId,
    additionalScopes: [{ tenantId: scope.dentistAssignment.assignedDentistTenantId, userId: scope.dentistAssignment.assignedDentistUserId }],
  });

  return {
    importBatchId,
    projectedOutcome: projected.outcome,
    actualOutcome: actual,
    rows: projected.rows,
  };
}

export async function ensureCalendarImportIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection('appointments').createIndex(
      { tenant_id: 1, user_id: 1, source: 1, external_instance_key: 1 },
      {
        unique: true,
        partialFilterExpression: {
          source: SOURCE,
          external_instance_key: { $type: 'string' },
        },
        name: 'uniq_calendar_import_external_instance',
      }
    ),
    db.collection('calendar_import_previews').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: 'ttl_calendar_import_previews' }),
    db.collection('calendar_import_batches').createIndex({ tenant_id: 1, user_id: 1, created_at: -1 }, { name: 'idx_calendar_import_batches_scope' }),
  ]);
}
