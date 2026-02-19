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

type ClientCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (client: ClientPayload) => void;
  title?: string;
};

export default function ClientCreateModal({
  isOpen,
  onClose,
  onCreated,
  title = 'Adauga client nou',
}: ClientCreateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    notes: '',
  });

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

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
    setFormData({ name: '', email: '', phone: '', notes: '' });
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
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 1,
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

      const createdClient = result?.client as ClientPayload;
      setFormData({ name: '', email: '', phone: '', notes: '' });
      if (createdClient && onCreated) {
        onCreated(createdClient);
      } else {
        onClose();
      }
    } catch (error: any) {
      setErrorMessage(error?.message || 'A aparut o eroare la creare.');
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
              {loading ? 'Se salveaza...' : 'Salveaza client'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
