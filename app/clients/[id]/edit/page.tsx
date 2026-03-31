import EditClientPageClient from './EditClientPageClient';
import { getClientProfileData } from '@/lib/server/client-profile';
import { getAuthUser } from '@/lib/auth-helpers';

export const revalidate = 30;

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientId = Number(id);

  if (!clientId || Number.isNaN(clientId)) {
    return <EditClientPageClient clientId={id} initialClient={null} />;
  }

  const { userId, tenantId } = await getAuthUser();
  const profile = await getClientProfileData(clientId, tenantId, userId);

  return (
    <EditClientPageClient
      clientId={id}
      initialClient={profile?.client ?? null}
    />
  );
}
