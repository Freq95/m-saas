'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ClientCreateModal from '@/components/ClientCreateModal';
import navStyles from '../../../dashboard/page.module.css';

interface Client {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

interface EditClientPageClientProps {
  clientId: string;
  initialClient: Client | null;
}

export default function EditClientPageClient({ clientId, initialClient }: EditClientPageClientProps) {
  const router = useRouter();
  const numericClientId = Number(clientId);

  if (!initialClient || Number.isNaN(numericClientId) || numericClientId <= 0) {
    return (
      <div className={navStyles.container}>
        <div style={{ padding: '1.5rem' }}>
          <p style={{ marginBottom: '0.8rem' }}>Clientul nu a fost gasit.</p>
          <Link href="/clients">Inapoi la clienti</Link>
        </div>
      </div>
    );
  }

  return (
    <ClientCreateModal
      isOpen
      mode="edit"
      clientId={numericClientId}
      initialData={initialClient}
      title="Editeaza client"
      submitLabel="Salveaza modificarile"
      onClose={() => router.push(`/clients/${clientId}`)}
      onUpdated={() => router.push(`/clients/${clientId}`)}
    />
  );
}
