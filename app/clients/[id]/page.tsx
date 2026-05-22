import ClientProfileClient from './ClientProfileClient';
import { getClientProfileData, getClientStatsData } from '@/lib/server/client-profile';
import { getAuthUser } from '@/lib/auth-helpers';
import { resolveClientScopeForClient } from '@/lib/client-permissions';

export const revalidate = 30;

export default async function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientId = Number(id);

  if (!clientId || Number.isNaN(clientId)) {
    return (
      <ClientProfileClient
        clientId={id}
        initialClient={null}
        initialAppointments={[]}
        initialConversations={[]}
        initialStats={null}
      />
    );
  }

  const auth = await getAuthUser();
  const scope = await resolveClientScopeForClient(auth, clientId);
  const profile = scope ? await getClientProfileData(clientId, scope.tenantId, scope.userId) : null;
  if (!profile) {
    return (
      <ClientProfileClient
        clientId={id}
        initialClient={null}
        initialAppointments={[]}
        initialConversations={[]}
        initialStats={null}
      />
    );
  }
  const stats = scope ? await getClientStatsData(clientId, scope.tenantId, scope.userId) : null;

  return (
    <ClientProfileClient
      clientId={id}
      initialClient={profile.client}
      initialAppointments={profile.appointments}
      initialConversations={profile.conversations}
      initialStats={stats}
    />
  );
}
