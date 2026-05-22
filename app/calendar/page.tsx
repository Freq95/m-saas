import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { startOfWeek, startOfDay, endOfDay, addDays } from 'date-fns';
import CalendarPageClient from './CalendarPageClient';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getAppointmentsData, getServicesData } from '@/lib/server/calendar';
import { getCalendarListForUser } from '@/lib/server/calendars-list';
import { listAvailabilityBlocks } from '@/lib/availability-blocks';
import { buildAvailabilityBlocksCacheKey } from './lib/availability-blocks-cache';

export const revalidate = 0;

export default async function CalendarPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  const now = new Date();
  const weekStart = startOfDay(startOfWeek(now, { weekStartsOn: 1 }));
  const weekEnd = endOfDay(addDays(weekStart, 6));

  const calendarList = await getCalendarListForUser(auth).catch(() => ({ ownCalendars: [], sharedCalendars: [], sentPendingShares: [] }));
  const visibleCalendarIds = [...calendarList.ownCalendars, ...calendarList.sharedCalendars]
    .map((calendar: any) => calendar.id)
    .filter((id: unknown): id is number => typeof id === 'number');
  const initialServiceUserId = auth.role === 'asistent'
    ? auth.assigned_dentist_user_ids?.[0] ?? auth.userId
    : auth.userId;
  const initialAvailabilityBlocksCacheKey = buildAvailabilityBlocksCacheKey({
    startDate: weekStart,
    endDate: weekEnd,
    calendarIds: visibleCalendarIds.length > 0 ? visibleCalendarIds : undefined,
  });
  const [initialAppointments, initialServices, initialAvailabilityBlocks] = await Promise.all([
    getAppointmentsData({
      userId: auth.userId,
      tenantId: auth.tenantId,
      calendarIds: visibleCalendarIds.length > 0 ? visibleCalendarIds : undefined,
      startDate: weekStart,
      endDate: weekEnd,
    }).catch(() => []),
    getServicesData(initialServiceUserId, auth.tenantId).catch(() => []),
    listAvailabilityBlocks({
      auth,
      calendarIds: visibleCalendarIds,
      startTime: weekStart,
      endTime: weekEnd,
    }).catch(() => []),
  ]);
  const asistentReassignState = auth.role === 'asistent'
    ? (auth.assigned_dentist_user_ids?.length ? (visibleCalendarIds.length === 0 ? 'inactive' : null) : 'empty')
    : null;

  return (
    <Suspense>
      <CalendarPageClient
        initialAppointments={initialAppointments as any}
        initialServices={initialServices as any}
        initialCalendarList={calendarList}
        initialAvailabilityBlocks={initialAvailabilityBlocks as any}
        initialAvailabilityBlocksCacheKey={initialAvailabilityBlocksCacheKey}
        initialSessionUserId={auth.userId}
        initialSessionDbUserId={auth.dbUserId.toString()}
        initialDate={now.toISOString()}
        initialViewType="week"
        asistentReassignState={asistentReassignState}
      />
    </Suspense>
  );
}
