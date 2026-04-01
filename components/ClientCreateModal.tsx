'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ClientCreateModal.module.css';
import { validatePhoneInput } from '@/lib/phone-validation';

type ClientPayload = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  consent_given?: boolean;
  consent_date?: string | null;
  consent_method?: string | null;
  is_minor?: boolean;
  parent_guardian_name?: string | null;
};

type ClientFormData = {
  name: string;
  email: string;
  phone: string;
  notes: string;
  consent_given: boolean;
  consent_method: string;
  is_minor: boolean;
  parent_guardian_name: string;
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
  const [phoneError, setPhoneError] = useState('');
  const [privacyNoticeText, setPrivacyNoticeText] = useState<string | null>(null);
  const [backdropPressStarted, setBackdropPressStarted] = useState(false);
  const [formData, setFormData] = useState<ClientFormData>({
    name: initialData?.name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    notes: initialData?.notes || '',
    consent_given: initialData?.consent_given || false,
    consent_method: initialData?.consent_method || '',
    is_minor: initialData?.is_minor || false,
    parent_guardian_name: initialData?.parent_guardian_name || '',
  });

  const isEditMode = mode === 'edit';

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen || privacyNoticeText !== null) return;
    fetch('/api/settings/gdpr')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.gdpr_privacy_notice_text) {
          setPrivacyNoticeText(data.gdpr_privacy_notice_text);
        }
      })
      .catch(() => null);
  }, [isOpen, privacyNoticeText]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage('');
    setPhoneError('');
    if (isEditMode) {
      setFormData({
        name: initialData?.name || '',
        email: initialData?.email || '',
        phone: initialData?.phone || '',
        notes: initialData?.notes || '',
        consent_given: initialData?.consent_given || false,
        consent_method: initialData?.consent_method || '',
        is_minor: initialData?.is_minor || false,
        parent_guardian_name: initialData?.parent_guardian_name || '',
      });
      return;
    }
    setFormData({ name: '', email: '', phone: '', notes: '', consent_given: false, consent_method: '', is_minor: false, parent_guardian_name: '' });
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

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    setBackdropPressStarted(event.target === event.currentTarget);
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const endedOnBackdrop = event.target === event.currentTarget;
    if (backdropPressStarted && endedOnBackdrop) {
      resetAndClose();
    }
    setBackdropPressStarted(false);
  };

  const resetAndClose = () => {
    if (loading) return;
    if (isEditMode) {
      setFormData({
        name: initialData?.name || '',
        email: initialData?.email || '',
        phone: initialData?.phone || '',
        notes: initialData?.notes || '',
        consent_given: initialData?.consent_given || false,
        consent_method: initialData?.consent_method || '',
        is_minor: initialData?.is_minor || false,
        parent_guardian_name: initialData?.parent_guardian_name || '',
      });
    } else {
      setFormData({ name: '', email: '', phone: '', notes: '', consent_given: false, consent_method: '', is_minor: false, parent_guardian_name: '' });
    }
    setErrorMessage('');
    setPhoneError('');
    onClose();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim()) {
      setErrorMessage('Numele este obligatoriu.');
      return;
    }
    const nextPhoneError = validatePhoneInput(formData.phone);
    if (nextPhoneError) {
      setPhoneError(nextPhoneError);
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
          consent_given: formData.consent_given || undefined,
          consent_date: formData.consent_given ? new Date().toISOString() : undefined,
          consent_method: formData.consent_method || undefined,
          is_minor: formData.is_minor || undefined,
          parent_guardian_name: formData.parent_guardian_name || undefined,
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

      setFormData({ name: '', email: '', phone: '', notes: '', consent_given: false, consent_method: '', is_minor: false, parent_guardian_name: '' });
      setPhoneError('');
      if (savedClient && onCreated) {
        onCreated(savedClient);
        onClose();
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
    <div
      className={styles.overlay}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
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
                onChange={(event) => {
                  const value = event.target.value;
                  setFormData((prev) => ({ ...prev, phone: value }));
                  if (phoneError && !validatePhoneInput(value)) {
                    setPhoneError('');
                  }
                }}
                onBlur={() => setPhoneError(validatePhoneInput(formData.phone))}
                placeholder="+40 123 456 789"
              />
              {phoneError && <div className={styles.fieldError}>{phoneError}</div>}
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

            <div className={`${styles.field} ${styles.fieldFull}`} style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Consimtamant GDPR</label>
              {privacyNoticeText && (
                <p style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-soft)',
                  background: 'var(--color-surface-muted)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  padding: '0.6rem 0.75rem',
                  marginTop: '0.5rem',
                  lineHeight: 1.5,
                }}>
                  {privacyNoticeText}
                </p>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="consent-given" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  id="consent-given"
                  type="checkbox"
                  checked={formData.consent_given}
                  onChange={(e) => setFormData(prev => ({ ...prev, consent_given: e.target.checked }))}
                  style={{ width: '18px', height: '18px' }}
                />
                Consimtamant obtinut
              </label>
            </div>

            <div className={styles.field}>
              <label htmlFor="consent-method">Metoda</label>
              <select
                id="consent-method"
                value={formData.consent_method}
                onChange={(e) => setFormData(prev => ({ ...prev, consent_method: e.target.value }))}
                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem' }}
              >
                <option value="">-- Selecteaza --</option>
                <option value="digital_signature">Semnatura digitala</option>
                <option value="scanned_document">Document scanat</option>
                <option value="paper_on_file">Document fizic</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="is-minor" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  id="is-minor"
                  type="checkbox"
                  checked={formData.is_minor}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_minor: e.target.checked }))}
                  style={{ width: '18px', height: '18px' }}
                />
                Pacient minor
              </label>
            </div>

            {formData.is_minor && (
              <div className={styles.field}>
                <label htmlFor="parent-name">Parinte / Tutore</label>
                <input
                  id="parent-name"
                  type="text"
                  value={formData.parent_guardian_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, parent_guardian_name: e.target.value }))}
                  placeholder="Numele parintelui sau tutorelui"
                />
              </div>
            )}
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
