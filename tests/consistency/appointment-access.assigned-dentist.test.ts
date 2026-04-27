import { describe, expect, it } from 'vitest';
import { decorateAppointmentWithCalendarAccess } from '@/app/calendar/lib/appointment-access';
import type { Appointment, CalendarPermissions } from '@/app/calendar/hooks';
import type { CalendarListItem } from '@/app/calendar/hooks/useCalendarList';

const basePermissions: CalendarPermissions = {
  can_view: true,
  can_create: true,
  can_edit_own: true,
  can_edit_all: false,
  can_delete_own: true,
  can_delete_all: false,
};

const calendar: CalendarListItem = {
  id: 11,
  name: 'Shared',
  color_mine: '#111111',
  color_others: '#222222',
  isOwner: false,
  permissions: basePermissions,
  shareId: 5,
};

function appointment(overrides: Partial<Appointment>): Appointment {
  return {
    id: 1,
    calendar_id: 11,
    client_name: 'Ana',
    service_name: 'Consultatie',
    start_time: '2026-04-10T09:00:00.000Z',
    end_time: '2026-04-10T09:30:00.000Z',
    status: 'scheduled',
    ...overrides,
  };
}

describe('frontend shared-calendar access decoration', () => {
  it('enables edit/delete/drag for the assigned dentist', () => {
    const decorated = decorateAppointmentWithCalendarAccess(
      appointment({ dentist_db_user_id: 'dentist-a', created_by_user_id: 'owner' }),
      new Map([[11, calendar]]),
      'dentist-a'
    );

    expect(decorated.can_edit).toBe(true);
    expect(decorated.can_delete).toBe(true);
    expect(decorated.can_change_status).toBe(true);
    expect(decorated.can_drag).toBe(true);
  });

  it('disables edit/delete/drag when only the creator matches and another dentist is assigned', () => {
    const decorated = decorateAppointmentWithCalendarAccess(
      appointment({ dentist_db_user_id: 'dentist-b', created_by_user_id: 'dentist-a' }),
      new Map([[11, calendar]]),
      'dentist-a'
    );

    expect(decorated.can_edit).toBe(false);
    expect(decorated.can_delete).toBe(false);
    expect(decorated.can_change_status).toBe(false);
    expect(decorated.can_drag).toBe(false);
  });
});
