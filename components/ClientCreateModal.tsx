'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ClientCreateModal.module.css';

type ClientPayload = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

type ClientFormData = {
  name: string;
  email: string;
  phone: string;
  notes: string;
};

type ClientCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'create' | 'edit';
  clientId?: number;
  initialData?: Partial<ClientPayload> | null;
  onCreated?: (client: ClientPayload) => void;
  onUpdated?: (client: ClientPayload) => void;
  title?: string;
  submitLabel?: string;
};

export default function ClientCreateModal({
  isOpen,
  onClose,
  mode = 'create',
  clientId,
  initialData,
  onCreated,
  onUpdated,
  title = 'Adauga client nou',
  submitLabel,
}: ClientCreateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState<ClientFormData>({
    name: initialData?.name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    notes: initialData?.notes || '',
  });

  const isEditMode = mode === 'edit';

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage('');
    if (isEditMode) {
      setFormData({
        name: initialData?.name || '',
        email: initialData?.email || '',
        phone: initialData?.phone || '',
        notes: initialData?.notes || '',
      });
      return;
    }
    setFormData({
      name: '',
      email: '',
      phone: '',
      notes: '',
    });
  }, [isOpen, isEditMode, initialData]);

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [isOpen, loading, onClose]);

  useEffect(() => {
    if (!isOpen || !mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, mounted]);

  if (!isOpen || !mounted) return null;

  const resetAndClose = () => {
    if (loading) return;
    if (isEditMode) {
      setFormData({
        name: initialData?.name || '',
        email: initialData?.email || '',
        phone: initialData?.phone || '',
        notes: initialData?.notes || '',
      });
    } else {
      setFormData({ name: '', email: '', phone: '', notes: '' });
    }
    setErrorMessage('');
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim()) {
      setErrorMessage('Numele este obligatoriu.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      if (isEditMode && !clientId) {
        throw new Error('Client invalid pentru editare.');
      }

      const response = await fetch(isEditMode ? `/api/clients/${clientId}` : '/api/clients', {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          notes: formData.notes || undefined,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Nu s-a putut crea clientul.');
      }

      const savedClient = result?.client as ClientPayload;
      if (isEditMode) {
        if (savedClient && onUpdated) {
          onUpdated(savedClient);
          return;
        }
        onClose();
        return;
      }

      setFormData({ name: '', email: '', phone: '', notes: '' });
      if (savedClient && onCreated) {
        onCreated(savedClient);
        return;
      }
      onClose();
    } catch (error: any) {
      const fallback = isEditMode ? 'A aparut o eroare la actualizare.' : 'A aparut o eroare la creare.';
      setErrorMessage(error?.message || fallback);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className={styles.overlay} onClick={resetAndClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button type="button" className={styles.closeButton} onClick={resetAndClose} aria-label="Inchide">
            x
          </button>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.grid}>
            <div className={styles.field}>
              <label htmlFor="client-name">
                Nume <span className={styles.required}>*</span>
              </label>
              <input
                id="client-name"
                type="text"
                value={formData.name}
                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Nume complet"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="client-phone">Telefon</label>
              <input
                id="client-phone"
                type="tel"
                value={formData.phone}
                onChange={(event) => setFormData((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="+40 123 456 789"
              />
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="client-email">Email</label>
              <input
                id="client-email"
                type="email"
                value={formData.email}
                onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="email@example.com"
              />
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label htmlFor="client-notes">Notite</label>
              <textarea
                id="client-notes"
                value={formData.notes}
                onChange={(event) => setFormData((prev) => ({ ...prev, notes: event.target.value }))}
                placeholder="Detalii utile despre client..."
              />
            </div>
          </div>

          {errorMessage && <div className={styles.error}>{errorMessage}</div>}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={resetAndClose}>
              Anuleaza
            </button>
            <button type="submit" className={styles.submitButton} disabled={loading || !formData.name.trim()}>
              {loading ? 'Se salveaza...' : (submitLabel || (isEditMode ? 'Salveaza modificarile' : 'Salveaza client'))}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
