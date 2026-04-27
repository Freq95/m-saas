import ClientsPageClient from './ClientsPageClient';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getClientsData } from '@/lib/server/clients';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  const data = await getClientsData({
    userId: auth.userId,
    tenantId: auth.tenantId,
  });

  return (
    <ClientsPageClient
      initialClients={data.clients}
      initialPagination={data.pagination}
    />
  );
}
