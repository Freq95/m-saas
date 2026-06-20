import ClientProfileClient from './ClientProfileClient';
import { getClientProfileData, getClientStatsData } from '@/lib/server/client-profile';
import { getAuthUser, isClinicalRole } from '@/lib/auth-helpers';
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
        canEditDental={false}
        canEditTreatmentPlans={false}
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
        canEditDental={false}
        canEditTreatmentPlans={false}
      />
    );
  }
  const stats = scope ? await getClientStatsData(clientId, scope.tenantId, scope.userId) : null;
  const canEditDental = isClinicalRole(auth.role) && !scope?.viaSharedCalendar;
  const canEditTreatmentPlans = isClinicalRole(auth.role) && !scope?.viaSharedCalendar;

  return (
    <ClientProfileClient
      clientId={id}
      initialClient={profile.client}
      initialAppointments={profile.appointments}
      initialConversations={profile.conversations}
      initialStats={stats}
      canEditDental={canEditDental}
      canEditTreatmentPlans={canEditTreatmentPlans}
    />
  );
}
