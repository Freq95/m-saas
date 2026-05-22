import { Suspense } from 'react';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { SettingsSkeleton } from '../SettingsSkeleton';
import AccountSettingsPageClient from './AccountSettingsPageClient';

export const revalidate = 30;

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton activeTab="account" />}>
      <AccountContent />
    </Suspense>
  );
}

async function AccountContent() {
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
      isOwner={auth.role === 'owner'}
    />
  );
}
