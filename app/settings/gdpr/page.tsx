import { Suspense } from 'react';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { SettingsSkeleton } from '../SettingsSkeleton';
import GdprSettingsPageClient from './GdprSettingsPageClient';

export const revalidate = 30;

const DEFAULT_PRIVACY_NOTICE =
  'Datele dumneavoastra personale sunt prelucrate in conformitate cu Regulamentul (UE) 2016/679 (GDPR). ' +
  'Aveti dreptul la acces, rectificare, stergere si portabilitatea datelor. ' +
  'Pentru exercitarea drepturilor dumneavoastra, va rugam sa contactati cabinetul.';

// Editable for clinic professionals; receptionists and asistents view read-only.
const EDIT_ROLES = new Set(['owner', 'dentist']);

export default function GdprSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton activeTab="gdpr" />}>
      <GdprContent />
    </Suspense>
  );
}

async function GdprContent() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  const db = await getMongoDbOrThrow();
  const tenant = await db.collection('tenants').findOne(
    { _id: auth.tenantId },
    { projection: { gdpr_privacy_notice_text: 1 } }
  );

  const initialText = tenant?.gdpr_privacy_notice_text ?? DEFAULT_PRIVACY_NOTICE;
  const canEdit = EDIT_ROLES.has(auth.role);
  const isOwner = auth.role === 'owner';

  return <GdprSettingsPageClient initialText={initialText} canEdit={canEdit} isOwner={isOwner} />;
}
