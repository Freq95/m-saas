import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import {
  getCalendarListForUser,
  getPendingSharesForUser,
} from '@/lib/server/calendars-list';
import CalendarsSettingsPageClient from './CalendarsSettingsPageClient';

export const dynamic = 'force-dynamic';

export default async function CalendarsSettingsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  const [calendarList, pendingShareList] = await Promise.all([
    getCalendarListForUser(auth).catch(() => null),
    getPendingSharesForUser(auth).catch(() => null),
  ]);

  return (
    <CalendarsSettingsPageClient
      initialRole={auth.role}
      initialUserId={auth.userId}
      initialCalendarList={calendarList}
      initialPendingShareList={pendingShareList}
    />
  );
}
