import ClientsPageClient from './ClientsPageClient';
import { getClientsData } from '@/lib/server/clients';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';

export const revalidate = 30;

export default async function ClientsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const userId = Number.parseInt(session.user.id, 10);
  if (!Number.isFinite(userId) || userId <= 0) redirect('/login');

  const tenantIdRaw = session.user.tenantId;
  if (!tenantIdRaw || !ObjectId.isValid(tenantIdRaw)) redirect('/login');

  const data = await getClientsData({
    userId,
    tenantId: new ObjectId(tenantIdRaw),
  });

  return (
    <ClientsPageClient
      initialClients={data.clients}
      initialPagination={data.pagination}
    />
  );
}
