'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../page.module.css';
import type { CalendarListItem, CalendarPermissions } from '../../hooks';

interface CalendarShareItem {
  id: number;
  shared_with_email: string;
  shared_with_user_id?: string | null;
  permissions: CalendarPermissions;
  dentist_display_name?: string | null;
  recipientName?: string | null;
  shared_by_name?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  accepted_at?: string | null;
  updated_at?: string | null;
}

interface ShareCalendarModalProps {
  isOpen: boolean;
  calendar: CalendarListItem | null;
  onClose: () => void;
  onChanged?: () => Promise<void> | void;
}

type ShareNotice =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string }
  | null;

const DEFAULT_PERMISSIONS: CalendarPermissions = {
  can_view: true,
  can_create: true,
  can_edit_own: true,
  can_edit_all: false,
  can_delete_own: true,
  can_delete_all: false,
};

const PERMISSION_OPTIONS: Array<{
  key: keyof Omit<CalendarPermissions, 'can_view'>;
  title: string;
  description: string;
}> = [
  {
    key: 'can_create',
    title: 'Poate crea programari',
    description: 'Permite adaugarea programarilor noi.',
  },
  {
    key: 'can_edit_own',
    title: 'Editeaza proprii',
    description: 'Poate modifica doar programarile proprii.',
  },
  {
    key: 'can_edit_all',
    title: 'Editeaza toate',
    description: 'Acces complet de editare pe calendar.',
  },
  {
    key: 'can_delete_own',
    title: 'Sterge proprii',
    description: 'Poate sterge doar programarile proprii.',
  },
  {
    key: 'can_delete_all',
    title: 'Sterge toate',
    description: 'Poate sterge orice programare.',
  },
];

function getErrorMessage(payload: any, fallback: string): string {
  if (payload && typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  return fallback;
}

function formatPermissionsSummary(permissions: CalendarPermissions): string {
  const parts = ['viz.'];
  if (permissions.can_create) parts.push('creare');
  if (permissions.can_edit_all) parts.push('editare toate');
  else if (permissions.can_edit_own) parts.push('editare proprii');
  if (permissions.can_delete_all) parts.push('stergere toate');
  else if (permissions.can_delete_own) parts.push('stergere proprii');
  return parts.join(', ');
}

const STATUS_LABEL: Record<CalendarShareItem['status'], string> = {
  accepted: 'Acceptat',
  declined: 'Refuzat',
  revoked: 'Revocat',
  pending: 'In asteptare',
};

const STATUS_CLASS: Record<CalendarShareItem['status'], string> = {
  accepted: styles.shareStatusAccepted,
  declined: styles.shareStatusDeclined,
  revoked: styles.shareStatusRevoked,
  pending: styles.shareStatusPending,
};

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconEdit = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

export function ShareCalendarModal({
  isOpen,
  calendar,
  onClose,
  onChanged,
}: ShareCalendarModalProps) {
  const backdropPressStartedRef = useRef(false);
  const [shares, setShares] = useState<CalendarShareItem[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [processingShareId, setProcessingShareId] = useState<number | null>(null);
  const [editingShareId, setEditingShareId] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [permissions, setPermissions] = useState<CalendarPermissions>(DEFAULT_PERMISSIONS);
  const [notice, setNotice] = useState<ShareNotice>(null);

  const isEditing = editingShareId !== null;

  const loadShares = async () => {
    if (!calendar) { setShares([]); return; }
    setLoadingShares(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/calendars/${calendar.id}/shares`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getErrorMessage(payload, 'Nu am putut incarca lista de partajari.'));
      setShares(Array.isArray(payload?.shares) ? payload.shares : []);
    } catch (loadError) {
      setShares([]);
      setNotice({ kind: 'error', text: loadError instanceof Error ? loadError.message : 'Nu am putut incarca lista de partajari.' });
    } finally {
      setLoadingShares(false);
    }
  };

  const resetForm = () => {
    setEditingShareId(null);
    setEmail('');
    setPermissions(DEFAULT_PERMISSIONS);
  };

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    void loadShares();
  }, [calendar, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting && processingShareId === null) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isSubmitting, onClose, processingShareId]);

  const requestClose = () => {
    if (isSubmitting || processingShareId !== null) return;
    onClose();
  };

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    backdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const endedOnBackdrop = event.target === event.currentTarget;
    if (backdropPressStartedRef.current && endedOnBackdrop) requestClose();
    backdropPressStartedRef.current = false;
  };

  const setPermission = (key: keyof Omit<CalendarPermissions, 'can_view'>, value: boolean) => {
    setPermissions((current) => {
      const next = { ...current, [key]: value };
      if (key === 'can_edit_all' && value) next.can_edit_own = true;
      if (key === 'can_delete_all' && value) next.can_delete_own = true;
      if (key === 'can_edit_own' && !value) next.can_edit_all = false;
      if (key === 'can_delete_own' && !value) next.can_delete_all = false;
      return next;
    });
  };

  const editingShare = useMemo(
    () => shares.find((s) => s.id === editingShareId) || null,
    [editingShareId, shares]
  );

  const handleSubmit = async () => {
    if (!calendar) return;
    if (!isEditing && !email.trim()) {
      setNotice({ kind: 'error', text: 'Completeaza emailul persoanei de invitat.' });
      return;
    }
    setIsSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch(
        isEditing
          ? `/api/calendars/${calendar.id}/shares/${editingShareId}`
          : `/api/calendars/${calendar.id}/shares`,
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isEditing ? { permissions } : { email: email.trim(), permissions }),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, isEditing ? 'Nu am putut actualiza partajarea.' : 'Nu am putut trimite invitatia.'));
      }
      await loadShares();
      await onChanged?.();
      resetForm();
      setNotice({ kind: 'success', text: isEditing ? 'Permisiunile au fost actualizate.' : 'Invitatia a fost trimisa.' });
    } catch (submitError) {
      setNotice({ kind: 'error', text: submitError instanceof Error ? submitError.message : 'Nu am putut salva partajarea.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditShare = (share: CalendarShareItem) => {
    setEditingShareId(share.id);
    setEmail(share.shared_with_email);
    setPermissions({
      can_view: true,
      can_create: Boolean(share.permissions?.can_create),
      can_edit_own: Boolean(share.permissions?.can_edit_own),
      can_edit_all: Boolean(share.permissions?.can_edit_all),
      can_delete_own: Boolean(share.permissions?.can_delete_own),
      can_delete_all: Boolean(share.permissions?.can_delete_all),
    });
    setNotice(null);
  };

  const handleDeleteShare = async (share: CalendarShareItem) => {
    if (!calendar || processingShareId !== null) return;
    const confirmed = window.confirm(
      share.status === 'accepted'
        ? `Revoci accesul pentru ${share.shared_with_email}?`
        : `Stergi invitatia pentru ${share.shared_with_email}?`
    );
    if (!confirmed) return;
    setProcessingShareId(share.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/calendars/${calendar.id}/shares/${share.id}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        const payload = await response.json().catch(() => null);
        throw new Error(getErrorMessage(payload, 'Nu am putut elimina partajarea.'));
      }
      if (editingShareId === share.id) resetForm();
      await loadShares();
      await onChanged?.();
      setNotice({ kind: 'success', text: share.status === 'accepted' ? 'Accesul a fost revocat.' : 'Invitatia a fost eliminata.' });
    } catch (deleteError) {
      setNotice({ kind: 'error', text: deleteError instanceof Error ? deleteError.message : 'Nu am putut elimina partajarea.' });
    } finally {
      setProcessingShareId(null);
    }
  };

  if (!isOpen || !calendar) return null;

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        className={`${styles.modal} ${styles.shareModal}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Partajeaza calendarul"
      >
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <h3>Partajare</h3>
            <p className={styles.modalSubcopy}>
              <span
                className={styles.inlineCalendarDot}
                style={{ backgroundColor: calendar.color_mine }}
              />
              {calendar.name}
            </p>
          </div>
          <button
            type="button"
            className={styles.modalIconButton}
            onClick={requestClose}
            aria-label="Inchide"
          >
            <IconX />
          </button>
        </div>

        <div className={styles.modalContent}>
          {notice && (
            <div className={`${styles.feedbackBanner} ${notice.kind === 'error' ? styles.feedbackBannerError : styles.feedbackBannerSuccess}`}>
              {notice.text}
            </div>
          )}

          {/* Invite / edit form */}
          <section className={styles.modalSectionCard}>
            <div className={styles.modalSectionHeader}>
              <h4 className={styles.modalSectionTitle}>
                {isEditing
                  ? `Editeaza permisiunile — ${editingShare?.shared_with_email || ''}`
                  : 'Invita o persoana'}
              </h4>
              {isEditing && (
                <button
                  type="button"
                  className={styles.secondaryInlineAction}
                  onClick={resetForm}
                  disabled={isSubmitting}
                >
                  Renunta
                </button>
              )}
            </div>

            {!isEditing && (
              <div className={styles.modalField}>
                <label htmlFor="share-email">Email</label>
                <input
                  id="share-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="doctor@example.com"
                  disabled={isSubmitting}
                />
              </div>
            )}

            <div className={styles.modalField}>
              <label>Permisiuni</label>
              <div className={styles.permissionGrid}>
                {PERMISSION_OPTIONS.map((option) => {
                  const checked = Boolean(permissions[option.key]);
                  return (
                    <label
                      key={option.key}
                      className={`${styles.permissionCard}${checked ? ` ${styles.permissionCardChecked}` : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setPermission(option.key, e.target.checked)}
                        disabled={isSubmitting}
                      />
                      <span className={styles.permissionCardTitle}>{option.title}</span>
                      <span className={styles.permissionCardDescription}>{option.description}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Se salveaza...' : isEditing ? 'Actualizeaza' : 'Trimite invitatia'}
              </button>
            </div>
          </section>

          {/* Share list */}
          <section className={styles.modalSectionCard}>
            <div className={styles.modalSectionHeader}>
              <h4 className={styles.modalSectionTitle}>Partajari</h4>
              <span className={styles.shareCountBadge}>{shares.length}</span>
            </div>

            {loadingShares ? (
              <div className={styles.emptyStateCard}>Se incarca...</div>
            ) : shares.length === 0 ? (
              <div className={styles.emptyStateCard}>
                Nicio partajare inca.
              </div>
            ) : (
              <div className={styles.shareTableWrap}>
                <table className={styles.shareTable}>
                  <thead>
                    <tr>
                      <th>Destinatar</th>
                      <th className={styles.shareTableColStatus}>Status</th>
                      <th className={styles.shareTableColPerms}>Permisiuni</th>
                      <th className={styles.shareTableColActions} />
                    </tr>
                  </thead>
                  <tbody>
                    {shares.map((share) => (
                      <tr key={share.id} className={styles.shareTableRow}>
                        <td>
                          <div className={styles.shareRecipientCell}>
                            <span className={styles.shareRecipientName}>
                              {share.recipientName || share.dentist_display_name || share.shared_with_email}
                            </span>
                            {(share.recipientName || share.dentist_display_name) &&
                              (share.recipientName || share.dentist_display_name) !== share.shared_with_email && (
                              <span className={styles.shareRecipientEmail}>{share.shared_with_email}</span>
                            )}
                          </div>
                        </td>
                        <td className={styles.shareTableColStatus}>
                          <span className={`${styles.shareStatusBadge} ${STATUS_CLASS[share.status]}`}>
                            {STATUS_LABEL[share.status]}
                          </span>
                        </td>
                        <td className={styles.shareTableColPerms}>
                          <span className={styles.shareIdentityMeta}>
                            {formatPermissionsSummary(share.permissions)}
                          </span>
                        </td>
                        <td className={styles.shareTableColActions}>
                          <div className={styles.shareTableActions}>
                            <button
                              type="button"
                              className={styles.secondaryInlineAction}
                              onClick={() => handleEditShare(share)}
                              disabled={processingShareId === share.id || isSubmitting}
                              title="Editeaza permisiunile"
                              aria-label={`Editeaza ${share.shared_with_email}`}
                            >
                              <IconEdit />
                            </button>
                            <button
                              type="button"
                              className={styles.dangerInlineAction}
                              onClick={() => void handleDeleteShare(share)}
                              disabled={processingShareId === share.id || isSubmitting}
                              title={share.status === 'accepted' ? 'Revoca accesul' : 'Sterge invitatia'}
                              aria-label={share.status === 'accepted' ? `Revoca ${share.shared_with_email}` : `Sterge invitatia pentru ${share.shared_with_email}`}
                            >
                              {processingShareId === share.id ? '...' : share.status === 'accepted' ? 'Revoca' : 'Sterge'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
