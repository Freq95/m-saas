import EditClientPageClient from './EditClientPageClient';
import { getClientProfileData } from '@/lib/server/client-profile';
import { getAuthUser } from '@/lib/auth-helpers';
import { resolveClientScopeForClient } from '@/lib/client-permissions';

export const revalidate = 30;

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientId = Number(id);

  if (!clientId || Number.isNaN(clientId)) {
    return <EditClientPageClient clientId={id} initialClient={null} />;
  }

  const auth = await getAuthUser();
  const scope = await resolveClientScopeForClient(auth, clientId);
  const profile = scope ? await getClientProfileData(clientId, scope.tenantId, scope.userId) : null;

  return (
    <EditClientPageClient
      clientId={id}
      initialClient={profile?.client ?? null}
    />
  );
}
