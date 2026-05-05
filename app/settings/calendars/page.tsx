import { Suspense } from 'react';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import {
  getCalendarListForUser,
  getPendingSharesForUser,
} from '@/lib/server/calendars-list';
import { SettingsSkeleton } from '../SettingsSkeleton';
import CalendarsSettingsPageClient from './CalendarsSettingsPageClient';

export const revalidate = 30;

export default function CalendarsSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton activeTab="calendars" />}>
      <CalendarsContent />
    </Suspense>
  );
}

async function CalendarsContent() {
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
