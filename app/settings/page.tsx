import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth-helpers';
import SettingsRedirectClient from './SettingsRedirectClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  try {
    await getAuthUser();
  } catch {
    redirect('/login');
  }

  return <SettingsRedirectClient />;
}
