'use client';

import { useRouter } from 'next/navigation';
import ClientCreateModal from '@/components/ClientCreateModal';

export default function NewClientPageClient() {
  const router = useRouter();

  return (
    <ClientCreateModal
      isOpen
      onClose={() => router.push('/clients')}
      onCreated={(client) => router.push(`/clients/${client.id}`)}
    />
  );
}
