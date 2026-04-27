import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import AccountSettingsPageClient from './AccountSettingsPageClient';

export const dynamic = 'force-dynamic';

export default async function AccountSettingsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  return (
    <AccountSettingsPageClient
      initialName={auth.name}
      initialEmail={auth.email}
    />
  );
}
