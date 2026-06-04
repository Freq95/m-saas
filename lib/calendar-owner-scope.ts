import type { ObjectId } from 'mongodb';
import { AuthError, type AuthContext } from '@/lib/auth-helpers';
import { getCalendarAuth, type CalendarAuthContext } from '@/lib/calendar-auth';

export interface CalendarOwnerScope {
  userId: number;
  tenantId: ObjectId;
  calendarAuth: CalendarAuthContext;
}

export async function resolveCalendarOwnerScope(
  auth: AuthContext,
  calendarId: number
): Promise<CalendarOwnerScope> {
  const calendarAuth = await getCalendarAuth(auth, calendarId);

  // Asistents reaching a shared calendar must still be assigned to its
  // owner to read that owner's clients / services / categories. Otherwise
  // a calendar share alone would expose data the asistent shouldn't see.
  if (auth.role === 'asistent') {
    const assigned = auth.assigned_dentist_user_ids ?? [];
    if (!assigned.includes(calendarAuth.calendarOwnerId)) {
      throw new AuthError('Calendar not found', 404);
    }
  }

  return {
    userId: calendarAuth.calendarOwnerId,
    tenantId: calendarAuth.calendarTenantId,
    calendarAuth,
  };
}
