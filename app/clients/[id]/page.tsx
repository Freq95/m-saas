import ClientProfileClient from './ClientProfileClient';
import { getClientProfileData, getClientStatsData } from '@/lib/server/client-profile';
import { getAuthUser } from '@/lib/auth-helpers';

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

  const { userId, tenantId } = await getAuthUser();
  const profile = await getClientProfileData(clientId, tenantId, userId);
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
  const stats = await getClientStatsData(clientId, tenantId, userId);

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
