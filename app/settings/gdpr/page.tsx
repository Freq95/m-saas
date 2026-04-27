import { redirect } from 'next/navigation';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import GdprSettingsPageClient from './GdprSettingsPageClient';

export const dynamic = 'force-dynamic';

const DEFAULT_PRIVACY_NOTICE =
  'Datele dumneavoastra personale sunt prelucrate in conformitate cu Regulamentul (UE) 2016/679 (GDPR). ' +
  'Aveti dreptul la acces, rectificare, stergere si portabilitatea datelor. ' +
  'Pentru exercitarea drepturilor dumneavoastra, va rugam sa contactati cabinetul.';

export default async function GdprSettingsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  if (auth.role !== 'owner') {
    redirect('/settings/services');
  }

  const db = await getMongoDbOrThrow();
  const tenant = await db.collection('tenants').findOne(
    { _id: auth.tenantId },
    { projection: { gdpr_privacy_notice_text: 1 } }
  );

  const initialText = tenant?.gdpr_privacy_notice_text ?? DEFAULT_PRIVACY_NOTICE;

  return <GdprSettingsPageClient initialText={initialText} />;
}
