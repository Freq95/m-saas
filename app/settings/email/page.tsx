import EmailSettingsPageClient from './EmailSettingsPageClient';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getUserEmailIntegrations } from '@/lib/email-integrations';

export const dynamic = 'force-dynamic';

export default async function EmailSettingsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  const integrations = await getUserEmailIntegrations(auth.userId, auth.tenantId);

  return <EmailSettingsPageClient initialIntegrations={integrations} initialUserId={auth.userId} />;
}
