import EmailSettingsPageClient from './EmailSettingsPageClient';
import { redirect } from 'next/navigation';
import { getUserEmailIntegrations } from '@/lib/email-integrations';
import { auth } from '@/lib/auth';

export const revalidate = 30;

export default async function EmailSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = Number.parseInt(session.user.id, 10);
  if (!Number.isFinite(userId) || userId <= 0) redirect('/login');
  const integrations = await getUserEmailIntegrations(userId);

  return <EmailSettingsPageClient initialIntegrations={integrations} initialUserId={userId} />;
}
