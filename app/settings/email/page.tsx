import { Suspense } from 'react';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getUserEmailIntegrations } from '@/lib/email-integrations';
import { SettingsSkeleton } from '../SettingsSkeleton';
import EmailSettingsPageClient from './EmailSettingsPageClient';

export const revalidate = 30;

export default function EmailSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton activeTab="email" />}>
      <EmailContent />
    </Suspense>
  );
}

async function EmailContent() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  const integrations = await getUserEmailIntegrations(auth.userId, auth.tenantId);

  return <EmailSettingsPageClient initialIntegrations={integrations} initialUserId={auth.userId} isOwner={auth.role === 'owner'} />;
}
