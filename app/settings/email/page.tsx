import EmailSettingsPageClient from './EmailSettingsPageClient';
import { DEFAULT_USER_ID } from '@/lib/constants';
import { getUserEmailIntegrations } from '@/lib/email-integrations';

export const revalidate = 30;

export default async function EmailSettingsPage() {
  const integrations = await getUserEmailIntegrations(DEFAULT_USER_ID);

  return <EmailSettingsPageClient initialIntegrations={integrations} />;
}
