import type { ObjectId } from 'mongodb';
import type { AuthContext } from '@/lib/auth-helpers';
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

  return {
    userId: calendarAuth.calendarOwnerId,
    tenantId: calendarAuth.calendarTenantId,
    calendarAuth,
  };
}
