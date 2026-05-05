import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getTeamData } from '@/lib/server/team';
import { SettingsSkeleton } from '../SettingsSkeleton';
import TeamSettingsPageClient from './TeamSettingsPageClient';

export const revalidate = 30;

export default function TeamSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton activeTab="team" />}>
      <TeamContent />
    </Suspense>
  );
}

async function TeamContent() {
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
