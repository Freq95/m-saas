import ClientsPageClient from './ClientsPageClient';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getClientsData } from '@/lib/server/clients';
import { getAssignedClientDentistOptions } from '@/lib/client-permissions';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  const dentistOptions = await getAssignedClientDentistOptions(auth);
  const initialDentistUserId = auth.role === 'asistent' && dentistOptions.length > 0
    ? dentistOptions[0].userId
    : auth.userId;

  const data = await getClientsData({
    userId: initialDentistUserId,
    tenantId: auth.tenantId,
    sortBy: 'name',
    sortOrder: 'ASC',
  });

  return (
    <ClientsPageClient
      initialClients={data.clients}
      initialPagination={data.pagination}
      dentistOptions={dentistOptions}
      initialDentistUserId={initialDentistUserId}
    />
  );
}
