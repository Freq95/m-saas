import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { dashboardVisibleCalendarsCacheKey } from '@/lib/cache-keys';
import { getDashboardData } from '@/lib/server/dashboard';
import { getCalendarListForUser } from '@/lib/server/calendars-list';
import DashboardPageClient from './DashboardPageClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  const days = 7;
  const calendarList = await getCalendarListForUser(auth).catch(() => null);
  const visibleCalendarIds = [
    ...(calendarList?.ownCalendars || []),
    ...(calendarList?.sharedCalendars || []),
  ]
    .map((calendar: any) => calendar.id)
    .filter((id: unknown): id is number => typeof id === 'number');
  const initialDashboard = await getCached(
    dashboardVisibleCalendarsCacheKey({ tenantId: auth.tenantId, userId: auth.userId }, days, visibleCalendarIds),
    900,
    () => getDashboardData(auth.userId, auth.tenantId, days, visibleCalendarIds)
  ).catch(() => null);

  return <DashboardPageClient initialDashboard={initialDashboard} />;
}
