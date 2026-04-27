import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import SettingsMenuClient from './SettingsMenuClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  return <SettingsMenuClient role={auth.role} />;
}
