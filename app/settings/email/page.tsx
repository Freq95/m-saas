import EmailSettingsPageClient from './EmailSettingsPageClient';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth-helpers';
import { getUserEmailIntegrations } from '@/lib/email-integrations';

export const dynamic = 'force-dynamic';

export default async function EmailSettingsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch {
    redirect('/login');
  }

  const integrations = await getUserEmailIntegrations(auth.userId, auth.tenantId);

  return <EmailSettingsPageClient initialIntegrations={integrations} initialUserId={auth.userId} />;
}
