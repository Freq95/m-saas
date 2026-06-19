import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAuthUser, isClinicalRole, redirectToLogin } from '@/lib/auth-helpers';
import PageLoading from '@/components/PageLoading';
import { getTreatmentPlanSettingsPayload } from '@/lib/server/treatment-plans';
import TreatmentPlanSettingsClient from './TreatmentPlanSettingsClient';

export const revalidate = 30;

export default function TreatmentPlanSettingsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <TreatmentPlanSettingsContent />
    </Suspense>
  );
}

async function TreatmentPlanSettingsContent() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  if (!isClinicalRole(auth.role)) {
    redirect('/settings');
  }

  const payload = await getTreatmentPlanSettingsPayload(auth);
  return (
    <TreatmentPlanSettingsClient
      initialPayload={payload}
      isOwner={auth.role === 'owner'}
    />
  );
}
