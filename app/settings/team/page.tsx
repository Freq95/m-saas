import { Suspense } from 'react';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getTeamData } from '@/lib/server/team';
import PageLoading from '@/components/PageLoading';
import TeamSettingsPageClient from './TeamSettingsPageClient';

export const revalidate = 30;

export default function TeamSettingsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
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

  const initialTeamData = await getTeamData(auth).catch(() => null);

  return (
    <TeamSettingsPageClient
      initialTeamData={initialTeamData}
      viewMode={auth.role === 'owner' ? 'edit' : 'readonly'}
      isOwner={auth.role === 'owner'}
      currentUserId={auth.userId}
    />
  );
}
