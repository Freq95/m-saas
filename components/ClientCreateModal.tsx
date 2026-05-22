'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Drawer } from 'vaul';
import styles from './ClientCreateModal.module.css';
import { validatePhoneInput } from '@/lib/phone-validation';
import { useIsMobile } from '@/lib/useIsMobile';
import { useFocusRestore } from '@/lib/useFocusRestore';

type ClientPayload = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  consent_given?: boolean;
  consent_date?: string | null;
  consent_method?: string | null;
  consent_withdrawn?: boolean;
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
  dentistUserId?: number;
};

export default function ClientCreateModal({
  isOpen,
  onClose,
  mode = 'create',
  clientId,
  initialData,
  onCreated,
  onUpdated,
  title = 'Adauga pacient nou',
  submitLabel,
  dentistUserId,
}: ClientCreateModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [privacyNoticeText, setPrivacyNoticeText] = useState<string | null>(null);
  const [backdropPressStarted, setBackdropPressStarted] = useState(false);
  const initialHasValidConsent = Boolean(initialData?.consent_given && !initialData?.consent_withdrawn);
  const [formData, setFormData] = useState<ClientFormData>({
    name: initialData?.name || '',
    email: initialData?.email || '',
    phone: initialData?.phone || '',
    notes: initialData?.notes || '',
    consent_given: initialHasValidConsent,
    consent_method: initialData?.consent_method || '',
    is_minor: initialData?.is_minor || false,
    parent_guardian_name: initialData?.parent_guardian_name || '',
  });

  const isEditMode = mode === 'edit';
  const isMobile = useIsMobile();
  const resolvedSubmitLabel = submitLabel || (isEditMode ? 'Salveaza modificarile' : 'Salveaza pacient');

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
        consent_given: initialHasValidConsent,
        consent_method: initialData?.consent_method || '',
        is_minor: initialData?.is_minor || false,
        parent_guardian_name: initialData?.parent_guardian_name || '',
      });
      return;
    }
    setFormData({ name: '', email: '', phone: '', notes: '', consent_given: false, consent_method: '', is_minor: false, parent_guardian_name: '' });
  }, [isOpen, isEditMode, initialData, initialHasValidConsent]);

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

  // Return focus to the trigger button when the modal closes (a11y).
  useFocusRestore(isOpen);

  useEffect(() => {
    if (!isOpen || !mounted) return;
    if (isMobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, isMobile, mounted]);

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
        consent_given: initialHasValidConsent,
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
        throw new Error('Pacient invalid pentru editare.');
      }

      const consentChanged = isEditMode && formData.consent_given !== initialHasValidConsent;
      const payload: Record<string, unknown> = {
        name: formData.name,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        notes: formData.notes || undefined,
        consent_method: formData.consent_method || undefined,
        is_minor: formData.is_minor || undefined,
        parent_guardian_name: formData.parent_guardian_name || undefined,
        dentistUserId: !isEditMode ? dentistUserId : undefined,
      };

      if (isEditMode) {
        if (consentChanged) {
          payload.consent_given = formData.consent_given;
          payload.consent_withdrawn = false;
          if (formData.consent_given) payload.consent_date = new Date().toISOString();
        }
      } else {
        payload.consent_given = formData.consent_given || undefined;
        payload.consent_date = formData.consent_given ? new Date().toISOString() : undefined;
      }

      const response = await fetch(isEditMode ? `/api/clients/${clientId}` : '/api/clients', {
        method: isEditMode ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || 'Nu s-a putut crea pacientul.');
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

  const setField = <Key extends keyof ClientFormData>(field: Key, value: ClientFormData[Key]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isMobile) {
    return (
      <Drawer.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) resetAndClose();
        }}
        direction="bottom"
        handleOnly
        closeThreshold={0.28}
        dismissible={!loading}
      >
        <Drawer.Portal>
          <Drawer.Overlay className={styles.mobileOverlay} />
          <Drawer.Content className={styles.mobileSheet} aria-label={title}>
          <form className={styles.mobileForm} onSubmit={handleSubmit}>
            <fieldset className={styles.mobileFieldset} disabled={loading}>
              <div className={styles.mobileTopBar}>
                <button type="button" className={`${styles.mobileActionBtn} ${styles.mobileActionBtnLeft}`} onClick={resetAndClose}>
                  Anulati
                </button>
                <div className={styles.mobileTopBarCenter}>
                  <Drawer.Handle className={styles.mobileDragHandle} />
                  <Drawer.Title className={styles.mobileTopBarTitle}>{title}</Drawer.Title>
                </div>
                <button
                  type="submit"
                  className={`${styles.mobileActionBtn} ${styles.mobileActionBtnPrimary}`}
                  disabled={loading || !formData.name.trim()}
                >
                  {loading ? 'Salvare...' : 'Salveaza'}
                </button>
              </div>

              <div className={styles.mobileBody}>
                {errorMessage && <div className={styles.mobileError}>{errorMessage}</div>}

                <section className={styles.mobileSection}>
                  <label className={styles.mobileInputRow}>
                    <span className={styles.mobileRowIcon}><UserIcon /></span>
                    <span className={styles.mobileInputMain}>
                      <span className={styles.mobileInputLabel}>Nume *</span>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(event) => setField('name', event.target.value)}
                        placeholder="Nume complet"
                        required
                      />
                    </span>
                  </label>
                </section>

                <section className={styles.mobileSection}>
                  <label className={styles.mobileInputRow}>
                    <span className={styles.mobileRowIcon}><PhoneIcon /></span>
                    <span className={styles.mobileInputMain}>
                      <span className={styles.mobileInputLabel}>Telefon</span>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(event) => {
                          const value = event.target.value;
                          setField('phone', value);
                          if (phoneError && !validatePhoneInput(value)) setPhoneError('');
                        }}
                        onBlur={() => setPhoneError(validatePhoneInput(formData.phone))}
                        placeholder="+40 123 456 789"
                      />
                      {phoneError && <span className={styles.mobileFieldError}>{phoneError}</span>}
                    </span>
                  </label>

                  <label className={styles.mobileInputRow}>
                    <span className={styles.mobileRowIcon}><MailIcon /></span>
                    <span className={styles.mobileInputMain}>
                      <span className={styles.mobileInputLabel}>Email</span>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(event) => setField('email', event.target.value)}
                        placeholder="email@example.com"
                      />
                    </span>
                  </label>
                </section>

                <section className={styles.mobileSection}>
                  <label className={styles.mobileInputRow}>
                    <span className={styles.mobileRowIcon}><NotesIcon /></span>
                    <span className={styles.mobileInputMain}>
                      <span className={styles.mobileInputLabel}>Notite</span>
                      <textarea
                        value={formData.notes}
                        onChange={(event) => setField('notes', event.target.value)}
                        placeholder="Detalii utile despre pacient..."
                        rows={3}
                      />
                    </span>
                  </label>
                </section>

                <section className={styles.mobileSection}>
                  <div className={styles.mobileSectionHeader}>
                    <span className={styles.mobileRowIcon}><ShieldIcon /></span>
                    <div>
                      <div className={styles.mobileSectionTitle}>Consimtamant GDPR</div>
                      <div className={styles.mobileSectionCaption}>Date si acorduri pacient</div>
                    </div>
                  </div>

                  {privacyNoticeText && (
                    <div className={styles.mobileNotice}>
                      {privacyNoticeText}
                    </div>
                  )}

                  <label className={styles.mobileSwitchRow}>
                    <span>
                      <span className={styles.mobileSwitchTitle}>Consimtamant obtinut</span>
                      <span className={styles.mobileSwitchSubtitle}>Marcheaza acordul pacientului</span>
                    </span>
                    <MobileSwitch
                      checked={formData.consent_given}
                      onChange={(checked) => setField('consent_given', checked)}
                    />
                  </label>

                  <label className={styles.mobileInputRow}>
                    <span className={styles.mobileRowIcon}><DocumentIcon /></span>
                    <span className={styles.mobileInputMain}>
                      <span className={styles.mobileInputLabel}>Metoda</span>
                      <select
                        value={formData.consent_method}
                        onChange={(event) => setField('consent_method', event.target.value)}
                      >
                        <option value="">Selecteaza</option>
                        <option value="digital_signature">Semnatura digitala</option>
                        <option value="scanned_document">Document scanat</option>
                        <option value="paper_on_file">Document fizic</option>
                      </select>
                    </span>
                  </label>
                </section>

                <section className={styles.mobileSection}>
                  <label className={styles.mobileSwitchRow}>
                    <span>
                      <span className={styles.mobileSwitchTitle}>Pacient minor</span>
                      <span className={styles.mobileSwitchSubtitle}>Adauga parinte sau tutore</span>
                    </span>
                    <MobileSwitch
                      checked={formData.is_minor}
                      onChange={(checked) => setField('is_minor', checked)}
                    />
                  </label>

                  {formData.is_minor && (
                    <label className={styles.mobileInputRow}>
                      <span className={styles.mobileRowIcon}><GuardianIcon /></span>
                      <span className={styles.mobileInputMain}>
                        <span className={styles.mobileInputLabel}>Parinte / Tutore</span>
                        <input
                          type="text"
                          value={formData.parent_guardian_name}
                          onChange={(event) => setField('parent_guardian_name', event.target.value)}
                          placeholder="Numele parintelui sau tutorelui"
                        />
                      </span>
                    </label>
                  )}
                </section>
              </div>
            </fieldset>
          </form>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

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
                placeholder="Detalii utile despre pacient..."
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
              {loading ? 'Se salveaza...' : resolvedSubmitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3 7 12 13 21 7" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="14" y2="17" />
    </svg>
  );
}

function GuardianIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function MobileSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <span className={styles.mobileSwitch}>
      <input
        type="checkbox"
        className={styles.mobileSwitchInput}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label="Comutator"
      />
      <span className={styles.mobileSwitchTrack}>
        <span className={styles.mobileSwitchThumb} />
      </span>
    </span>
  );
}
