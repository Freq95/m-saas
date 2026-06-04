import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthUser, isClinicalRole, redirectToLogin } from '@/lib/auth-helpers';
import { getUserEmailIntegrations } from '@/lib/email-integrations';
import PageLoading from '@/components/PageLoading';
import EmailSettingsPageClient from './EmailSettingsPageClient';

export const revalidate = 30;

export default function EmailSettingsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
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

  // Email integrations are clinic-config — owner + dentists only.
  // Asistents and receptionists redirect back to the settings landing.
  if (!isClinicalRole(auth.role)) {
    redirect('/settings');
  }

  const integrations = await getUserEmailIntegrations(auth.userId, auth.tenantId);

  return <EmailSettingsPageClient initialIntegrations={integrations} initialUserId={auth.userId} isOwner={auth.role === 'owner'} />;
}
