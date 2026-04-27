import { ObjectId } from 'mongodb';
import { describe, expect, it, vi } from 'vitest';
import { canDeleteAppointment, canEditAppointment, type CalendarAuthContext } from '@/lib/calendar-auth';

vi.mock('@/lib/auth-helpers', () => {
  class AuthError extends Error {
    status: number;
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
    }
  }
  return { AuthError };
});

const currentDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0101');
const otherDbUserId = new ObjectId('65f9a0e8f5f89f73d18b0102');

function authWithOwnPermissions(): CalendarAuthContext {
  return {
    calendarId: 11,
    calendarTenantId: new ObjectId('65f9a0e8f5f89f73d18b0103'),
    calendarOwnerId: 42,
    calendarOwnerDbUserId: otherDbUserId,
    isOwner: false,
    permissions: {
      can_view: true,
      can_create: true,
      can_edit_own: true,
      can_edit_all: false,
      can_delete_own: true,
      can_delete_all: false,
    },
    shareId: 7,
  };
}

describe('shared-calendar own appointment permissions', () => {
  it('allows own edit/delete when the appointment is assigned to the current dentist', () => {
    const calendarAuth = authWithOwnPermissions();
    const appointment = {
      dentist_db_user_id: currentDbUserId,
      created_by_user_id: otherDbUserId,
    };

    expect(canEditAppointment(calendarAuth, appointment, currentDbUserId)).toBe(true);
    expect(canDeleteAppointment(calendarAuth, appointment, currentDbUserId)).toBe(true);
  });

  it('does not treat creator-only appointments as own when another dentist is assigned', () => {
    const calendarAuth = authWithOwnPermissions();
    const appointment = {
      dentist_db_user_id: otherDbUserId,
      created_by_user_id: currentDbUserId,
    };

    expect(canEditAppointment(calendarAuth, appointment, currentDbUserId)).toBe(false);
    expect(canDeleteAppointment(calendarAuth, appointment, currentDbUserId)).toBe(false);
  });
});
