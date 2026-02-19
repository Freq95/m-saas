'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';
import styles from './page.module.css';
import navStyles from '../../../dashboard/page.module.css';

interface Client {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

interface ClientFormData {
  id: number;
  name: string;
  email: string;
  phone: string;
  notes: string;
}

interface EditClientPageClientProps {
  clientId: string;
  initialClient: Client | null;
}

export default function EditClientPageClient({ clientId, initialClient }: EditClientPageClientProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ClientFormData>({
    id: 0,
    name: '',
    email: '',
    phone: '',
    notes: '',
  });
  const { toasts, removeToast, error: toastError } = useToast();

  useEffect(() => {
    if (initialClient) {
      setFormData({
        ...initialClient,
        email: initialClient.email || '',
        phone: initialClient.phone || '',
        notes: initialClient.notes || '',
      });
      setLoading(false);
      return;
    }

    fetchClient();
  }, [clientId, initialClient]);

  const fetchClient = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/clients/${clientId}`);
      if (!response.ok) throw new Error('Failed to fetch client');

      const result = await response.json();
      setFormData({
        ...result.client,
        email: result.client.email || '',
        phone: result.client.phone || '',
        notes: result.client.notes || '',
      });
    } catch (error) {
      console.error('Error fetching client:', error);
      toastError('Eroare la incarcarea clientului');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email || null,
          phone: formData.phone || null,
          notes: formData.notes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update client');
      }

      router.push(`/clients/${clientId}`);
    } catch (error: any) {
      console.error('Error updating client:', error);
      toastError(error.message || 'Eroare la actualizarea clientului');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={navStyles.container}>
        <div className={styles.container}>
          <div className={styles.loading}>Se incarca...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <div className={styles.header}>
          <Link href={`/clients/${clientId}`} className={styles.backLink} prefetch>
            Inapoi la profil
          </Link>
          <h1>Editeaza Client</h1>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.section}>
            <h2>Informatii de baza</h2>

            <div className={styles.field}>
              <label htmlFor="name">
                Nume <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nume complet"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="phone">Telefon</label>
              <input
                type="tel"
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+40 123 456 789"
              />
            </div>
          </div>

          <div className={styles.section}>
            <h2>Detalii</h2>

            <div className={styles.field}>
              <label htmlFor="notes">Notite</label>
              <textarea
                id="notes"
                rows={4}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Notite despre client..."
              />
            </div>
          </div>

          <div className={styles.actions}>
            <Link href={`/clients/${clientId}`} className={styles.cancelButton} prefetch>
              Anuleaza
            </Link>
            <button
              type="submit"
              disabled={saving || !formData.name.trim()}
              className={styles.submitButton}
            >
              {saving ? 'Se salveaza...' : 'Salveaza Modificarile'}
            </button>
          </div>
        </form>
      </div>
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
