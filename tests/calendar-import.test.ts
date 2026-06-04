import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-helpers', () => {
  class AuthError extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
    }
  }
  return {
    AuthError,
    isClinicalRole: (role: string) => role === 'owner' || role === 'dentist',
  };
});
import {
  applyProjectedActions,
  parseRowsFromImportFile,
  type CalendarImportOptions,
  type CalendarImportRow,
} from '@/lib/calendar-import';

const baseOptions: CalendarImportOptions = {
  calendarId: 1,
  dentistUserId: null,
  dateRangeStart: '2026-01-01',
  dateRangeEnd: '2026-12-31',
  recurrenceHorizonMonths: 12,
  includeOverlaps: false,
  includePrivate: false,
  duplicateStrategy: 'skip',
  placeholderServiceName: 'Eveniment importat',
};

function row(id: string, patch: Partial<CalendarImportRow> = {}): CalendarImportRow {
  return {
    id,
    externalUid: `uid-${id}`,
    externalInstanceKey: `uid-${id}:2026-06-01T09:00:00.000Z`,
    title: `Event ${id}`,
    clientName: `Event ${id}`,
    startTime: '2026-06-01T09:00:00.000Z',
    endTime: '2026-06-01T09:30:00.000Z',
    durationMinutes: 30,
    sourceCalendarName: 'Google',
    originalTimezone: 'Europe/Bucharest',
    rawSummary: `Event ${id}`,
    rawLocation: null,
    description: null,
    attendeeSummary: null,
    organizerSummary: null,
    isPrivate: false,
    isRecurring: false,
    isAllDay: false,
    invalidReason: null,
    duplicate: false,
    hasOverlap: false,
    hasAvailabilityBlock: false,
    projectedAction: 'import',
    ...patch,
  };
}

describe('calendar import preview rules', () => {
  it('projects import and skip counts from selected rows', () => {
    const rows = [
      row('ok'),
      row('duplicate', { duplicate: true }),
      row('blocked', { hasAvailabilityBlock: true }),
      row('private', { isPrivate: true }),
      row('invalid', { invalidReason: 'Interval invalid' }),
      row('deselected'),
    ];

    const result = applyProjectedActions(
      rows,
      baseOptions,
      ['ok', 'duplicate', 'blocked', 'private', 'invalid']
    );

    expect(result.outcome).toMatchObject({
      willImport: 1,
      willSkipDuplicates: 1,
      willSkipConflicts: 1,
      willSkipPrivate: 1,
      invalidOrIncomplete: 1,
      alreadyDeselected: 1,
    });
    expect(result.rows.find((item) => item.id === 'ok')?.projectedAction).toBe('import');
    expect(result.rows.find((item) => item.id === 'deselected')?.projectedAction).toBe('deselected');
  });

  it('allows overlap and private events when configured', () => {
    const rows = [
      row('overlap', { hasOverlap: true }),
      row('private', { isPrivate: true }),
    ];

    const result = applyProjectedActions(
      rows,
      { ...baseOptions, includeOverlaps: true, includePrivate: true },
      ['overlap', 'private']
    );

    expect(result.outcome.willImport).toBe(2);
    expect(result.outcome.willSkipConflicts).toBe(0);
    expect(result.outcome.willSkipPrivate).toBe(0);
  });
});

describe('calendar import ICS parser', () => {
  it('normalizes a simple ICS event into an import row', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'X-WR-CALNAME:Google Cabinet',
      'BEGIN:VEVENT',
      'UID:abc-123',
      'DTSTAMP:20260601T070000Z',
      'DTSTART:20260601T090000Z',
      'DTEND:20260601T093000Z',
      'SUMMARY:Ana Popescu',
      'LOCATION:Cabinet 1',
      'DESCRIPTION:Control',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');

    const file = new File([ics], 'calendar.ics', { type: 'text/calendar' });
    const result = await parseRowsFromImportFile(file, baseOptions);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      externalUid: 'abc-123',
      clientName: 'Ana Popescu',
      rawLocation: 'Cabinet 1',
      sourceCalendarName: 'Google Cabinet',
      durationMinutes: 30,
    });
  });

  it('expands a basic weekly recurring ICS event', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:weekly-123',
      'DTSTAMP:20260601T070000Z',
      'DTSTART:20260601T090000Z',
      'DTEND:20260601T093000Z',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'SUMMARY:Recall',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n');

    const file = new File([ics], 'recurring.ics', { type: 'text/calendar' });
    const result = await parseRowsFromImportFile(file, baseOptions);

    expect(result.rows).toHaveLength(3);
    expect(result.recurringExpanded).toBe(2);
    expect(result.rows.map((item) => item.externalInstanceKey)).toEqual([
      'weekly-123:2026-06-01T09:00:00.000Z',
      'weekly-123:2026-06-08T09:00:00.000Z',
      'weekly-123:2026-06-15T09:00:00.000Z',
    ]);
  });
});
