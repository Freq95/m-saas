import { notFound } from 'next/navigation';
import { getAuthUser } from '@/lib/auth-helpers';
import { resolveClientScopeForClient } from '@/lib/client-permissions';
import { getClientProfileData } from '@/lib/server/client-profile';
import RaportClient from './RaportClient';

export const revalidate = 0;

export default async function DentalReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clientId = Number(id);
  if (!clientId || Number.isNaN(clientId)) notFound();

  const auth = await getAuthUser();
  const scope = await resolveClientScopeForClient(auth, clientId);
  if (!scope) notFound();

  // Only pass JSON-safe scalars to the client; the report fetches its dental
  // data client-side from the same endpoint the tab uses (avoids leaking
  // Mongo ObjectId fields through RSC serialization).
  const profile = await getClientProfileData(clientId, scope.tenantId, scope.userId);
  if (!profile) notFound();

  return (
    <RaportClient
      clientId={id}
      clientName={profile.client.name}
      clinicianName={auth.name}
    />
  );
}
