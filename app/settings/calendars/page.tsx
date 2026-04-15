import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth-helpers';
import CalendarsSettingsPageClient from './CalendarsSettingsPageClient';

export const dynamic = 'force-dynamic';

export default async function CalendarsSettingsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch {
    redirect('/login');
  }

  return (
    <CalendarsSettingsPageClient
      initialRole={auth.role}
      initialUserId={auth.userId}
    />
  );
}
