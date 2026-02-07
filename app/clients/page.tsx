import ClientsPageClient from './ClientsPageClient';
import { getClientsData } from '@/lib/server/clients';

export const revalidate = 30;

export default async function ClientsPage() {
  try {
    const data = await getClientsData();
    return (
      <ClientsPageClient
        initialClients={data.clients}
        initialPagination={data.pagination}
      />
    );
  } catch {
    return (
      <ClientsPageClient
        initialClients={[]}
        initialPagination={{ page: 1, limit: 20, total: 0, totalPages: 0 }}
      />
    );
  }
}
