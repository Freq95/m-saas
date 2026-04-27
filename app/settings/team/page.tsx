import { redirect } from 'next/navigation';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getTeamData } from '@/lib/server/team';
import TeamSettingsPageClient from './TeamSettingsPageClient';

export const dynamic = 'force-dynamic';

export default async function TeamSettingsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  if (auth.role !== 'owner') {
    redirect('/settings/services');
  }

  const initialTeamData = await getTeamData(auth).catch(() => null);

  return <TeamSettingsPageClient initialTeamData={initialTeamData} />;
}
