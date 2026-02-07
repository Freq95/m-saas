import EditClientPageClient from './EditClientPageClient';
import { getClientProfileData } from '@/lib/server/client-profile';

export const revalidate = 30;

export default async function EditClientPage({ params }: { params: { id: string } }) {
  const clientId = Number(params.id);

  if (!clientId || Number.isNaN(clientId)) {
    return <EditClientPageClient clientId={params.id} initialClient={null} />;
  }

  const profile = await getClientProfileData(clientId);

  return (
    <EditClientPageClient
      clientId={params.id}
      initialClient={profile?.client ?? null}
    />
  );
}
