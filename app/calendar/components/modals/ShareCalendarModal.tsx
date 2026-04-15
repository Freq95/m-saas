'use client';

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import styles from '../../page.module.css';
import type { CalendarListItem, CalendarPermissions } from '../../hooks';
import {
  buildDentistPaletteState,
  DENTIST_COLOR_PALETTE,
  getDefaultDentistPaletteColor,
  isDentistPaletteColor,
  normalizeDentistColor,
} from '@/lib/calendar-color-policy';

interface CalendarShareItem {
  id: number;
  shared_with_email: string;
  shared_with_user_id?: string | null;
  permissions: CalendarPermissions;
  dentist_color?: string | null;
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
    description: 'Permite adaugarea programarilor si il face disponibil in selectorul de dentist.',
  },
  {
    key: 'can_edit_own',
    title: 'Poate edita programarile proprii',
    description: 'Poate modifica doar programarile pe care le-a creat.',
  },
  {
    key: 'can_edit_all',
    title: 'Poate edita toate programarile',
    description: 'Are acces complet de editare pentru toate programarile de pe calendar.',
  },
  {
    key: 'can_delete_own',
    title: 'Poate sterge programarile proprii',
    description: 'Poate anula sau sterge doar programarile pe care le-a creat.',
  },
  {
    key: 'can_delete_all',
    title: 'Poate sterge toate programarile',
    description: 'Poate sterge orice programare din calendarul partajat.',
  },
];

function getErrorMessage(payload: any, fallback: string): string {
  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }
  return fallback;
}

function formatPermissionsSummary(permissions: CalendarPermissions): string {
  const parts = ['vizualizare'];

  if (permissions.can_create) {
    parts.push('creare');
  }

  if (permissions.can_edit_all) {
    parts.push('editare toate');
  } else if (permissions.can_edit_own) {
    parts.push('editare proprii');
  }

  if (permissions.can_delete_all) {
    parts.push('stergere toate');
  } else if (permissions.can_delete_own) {
    parts.push('stergere proprii');
  }

  return parts.join(', ');
}

function getStatusLabel(status: CalendarShareItem['status']): string {
  switch (status) {
    case 'accepted':
      return 'Acceptat';
    case 'declined':
      return 'Refuzat';
    case 'revoked':
      return 'Revocat';
    default:
      return 'In asteptare';
  }
}

function getStatusClass(status: CalendarShareItem['status']): string {
  switch (status) {
    case 'accepted':
      return styles.shareStatusAccepted;
    case 'declined':
      return styles.shareStatusDeclined;
    case 'revoked':
      return styles.shareStatusRevoked;
    default:
      return styles.shareStatusPending;
  }
}

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
  const [dentistColor, setDentistColor] = useState<string>(DENTIST_COLOR_PALETTE[0]);
  const [permissions, setPermissions] = useState<CalendarPermissions>(DEFAULT_PERMISSIONS);
  const [notice, setNotice] = useState<ShareNotice>(null);

  const isEditing = editingShareId !== null;
  const shareColorInputs = useMemo(
    () => shares.map((share) => ({
      id: share.id,
      status: share.status,
      dentistColor: share.dentist_color,
    })),
    [shares]
  );
  const paletteState = useMemo(
    () => buildDentistPaletteState({
      ownerColor: calendar?.color,
      colorMode: calendar?.settings?.color_mode,
      shares: shareColorInputs,
      excludeShareId: editingShareId,
    }),
    [calendar?.color, calendar?.settings?.color_mode, editingShareId, shareColorInputs]
  );
  const ownerNeedsPaletteNormalization = paletteState.ownerNeedsPaletteNormalization;
  const reservedPaletteColors = useMemo(
    () => new Set(paletteState.reservedPaletteColors),
    [paletteState.reservedPaletteColors]
  );
  const paletteExhausted = !isEditing && paletteState.availablePaletteColors.length === 0;

  const loadShares = async () => {
    if (!calendar) {
      setShares([]);
      return;
    }

    setLoadingShares(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/calendars/${calendar.id}/shares`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getErrorMessage(payload, 'Nu am putut incarca lista de partajari.'));
      }

      setShares(Array.isArray(payload?.shares) ? payload.shares : []);
    } catch (loadError) {
      setShares([]);
      setNotice({
        kind: 'error',
        text: loadError instanceof Error ? loadError.message : 'Nu am putut incarca lista de partajari.',
      });
    } finally {
      setLoadingShares(false);
    }
  };

  const resetForm = (nextCalendar?: CalendarListItem | null) => {
    setEditingShareId(null);
    setEmail('');
    setDentistColor(
      getDefaultDentistPaletteColor({
        ownerColor: nextCalendar?.color || calendar?.color,
        shares: shareColorInputs,
        fallbackColor: DENTIST_COLOR_PALETTE[0],
      })
    );
    setPermissions(DEFAULT_PERMISSIONS);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    resetForm(calendar);
    void loadShares();
  }, [calendar, isOpen]);

  useEffect(() => {
    if (!isOpen || isEditing) {
      return;
    }

    const normalizedCurrentColor = normalizeDentistColor(dentistColor);
    if (
      normalizedCurrentColor &&
      isDentistPaletteColor(normalizedCurrentColor) &&
      !reservedPaletteColors.has(normalizedCurrentColor)
    ) {
      return;
    }

    setDentistColor(
      getDefaultDentistPaletteColor({
        ownerColor: calendar?.color,
        shares: shareColorInputs,
        excludeShareId: editingShareId,
        fallbackColor: DENTIST_COLOR_PALETTE[0],
      })
    );
  }, [calendar?.color, dentistColor, editingShareId, isEditing, isOpen, reservedPaletteColors, shareColorInputs]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting && processingShareId === null) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isSubmitting, onClose, processingShareId]);

  const requestClose = () => {
    if (isSubmitting || processingShareId !== null) {
      return;
    }
    onClose();
  };

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    backdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const endedOnBackdrop = event.target === event.currentTarget;
    if (backdropPressStartedRef.current && endedOnBackdrop) {
      requestClose();
    }
    backdropPressStartedRef.current = false;
  };

  const setPermission = (
    key: keyof Omit<CalendarPermissions, 'can_view'>,
    value: boolean
  ) => {
    setPermissions((current) => {
      const next = {
        ...current,
        [key]: value,
      };

      if (key === 'can_edit_all' && value) {
        next.can_edit_own = true;
      }
      if (key === 'can_delete_all' && value) {
        next.can_delete_own = true;
      }
      if (key === 'can_edit_own' && !value) {
        next.can_edit_all = false;
      }
      if (key === 'can_delete_own' && !value) {
        next.can_delete_all = false;
      }

      return next;
    });
  };

  const editingShare = useMemo(
    () => shares.find((share) => share.id === editingShareId) || null,
    [editingShareId, shares]
  );

  const handleSubmit = async () => {
    if (!calendar) {
      return;
    }

    if (!isEditing && !email.trim()) {
      setNotice({ kind: 'error', text: 'Completeaza emailul persoanei pe care vrei sa o inviti.' });
      return;
    }
    if (ownerNeedsPaletteNormalization) {
      setNotice({
        kind: 'error',
        text: 'Alege mai intai o culoare presetata pentru owner in modul Dentisti.',
      });
      return;
    }
    if (!isDentistPaletteColor(dentistColor)) {
      setNotice({ kind: 'error', text: 'Selecteaza o culoare valida din paleta presetata.' });
      return;
    }
    if (reservedPaletteColors.has(dentistColor)) {
      setNotice({ kind: 'error', text: 'Aceasta culoare este deja folosita pe acest calendar.' });
      return;
    }
    if (paletteExhausted) {
      setNotice({ kind: 'error', text: 'Toate culorile disponibile sunt deja folosite pe acest calendar.' });
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
          body: JSON.stringify(
            isEditing
              ? {
                  permissions,
                  dentistColor,
                }
              : {
                  email: email.trim(),
                  permissions,
                  dentistColor,
                }
          ),
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            payload,
            isEditing ? 'Nu am putut actualiza partajarea.' : 'Nu am putut trimite invitatia.'
          )
        );
      }

      await loadShares();
      await onChanged?.();
      resetForm(calendar);
      setNotice({
        kind: 'success',
        text: isEditing ? 'Permisiunile au fost actualizate.' : 'Invitatia a fost trimisa.',
      });
    } catch (submitError) {
      setNotice({
        kind: 'error',
        text: submitError instanceof Error ? submitError.message : 'Nu am putut salva partajarea.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditShare = (share: CalendarShareItem) => {
    setEditingShareId(share.id);
    setEmail(share.shared_with_email);
    setDentistColor(normalizeDentistColor(share.dentist_color) || DENTIST_COLOR_PALETTE[0]);
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
    if (!calendar || processingShareId !== null) {
      return;
    }

    const confirmed = window.confirm(
      share.status === 'accepted'
        ? `Revoci accesul pentru ${share.shared_with_email}?`
        : `Stergi invitatia pentru ${share.shared_with_email}?`
    );
    if (!confirmed) {
      return;
    }

    setProcessingShareId(share.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/calendars/${calendar.id}/shares/${share.id}`, {
        method: 'DELETE',
      });

      if (!response.ok && response.status !== 204) {
        const payload = await response.json().catch(() => null);
        throw new Error(getErrorMessage(payload, 'Nu am putut elimina partajarea.'));
      }

      if (editingShareId === share.id) {
        resetForm(calendar);
      }

      await loadShares();
      await onChanged?.();
      setNotice({
        kind: 'success',
        text: share.status === 'accepted' ? 'Accesul a fost revocat.' : 'Invitatia a fost eliminata.',
      });
    } catch (deleteError) {
      setNotice({
        kind: 'error',
        text: deleteError instanceof Error ? deleteError.message : 'Nu am putut elimina partajarea.',
      });
    } finally {
      setProcessingShareId(null);
    }
  };

  if (!isOpen || !calendar) {
    return null;
  }

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        className={`${styles.modal} ${styles.shareModal}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Partajeaza calendarul"
      >
        <div className={styles.modalHeader}>
          <div>
            <h3>Partajeaza calendarul</h3>
            <p className={styles.modalSubcopy}>
              <span className={styles.inlineCalendarDot} style={{ backgroundColor: calendar.color }} />
              {calendar.name}
            </p>
          </div>

          <button type="button" className={styles.modalIconButton} onClick={requestClose} aria-label="Inchide">
            x
          </button>
        </div>

        <div className={styles.modalContent}>
          {notice && (
            <div
              className={`${styles.feedbackBanner} ${notice.kind === 'error' ? styles.feedbackBannerError : styles.feedbackBannerSuccess}`}
            >
              {notice.text}
            </div>
          )}

          <section className={styles.modalSectionCard}>
            <div className={styles.modalSectionHeader}>
              <div>
                <h4 className={styles.modalSectionTitle}>
                  {isEditing ? 'Editeaza accesul' : 'Invita o persoana'}
                </h4>
                <p className={styles.modalSectionMeta}>
                  {isEditing
                    ? `Actualizezi permisiunile pentru ${editingShare?.shared_with_email || 'aceasta partajare'}.`
                    : 'Trimite acces catre un coleg sau un dentist extern.'}
                </p>
              </div>
              {isEditing && (
                <button
                  type="button"
                  className={styles.secondaryInlineAction}
                  onClick={() => resetForm(calendar)}
                  disabled={isSubmitting}
                >
                  Renunta la editare
                </button>
              )}
            </div>

            <div className={styles.modalField}>
              <label htmlFor="share-email">Email</label>
              <input
                id="share-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="doctor@example.com"
                disabled={isEditing || isSubmitting}
              />
            </div>

            <div className={styles.modalField}>
              <label htmlFor="share-dentist-color">Culoarea dentistului</label>
              <div className={styles.paletteGrid} role="listbox" aria-label="Paleta de culori pentru dentist">
                {DENTIST_COLOR_PALETTE.map((paletteColor) => {
                  const isSelected = paletteColor === dentistColor;
                  const isTaken = reservedPaletteColors.has(paletteColor);
                  return (
                    <button
                      key={paletteColor}
                      type="button"
                      className={`${styles.paletteColorButton}${isSelected ? ` ${styles.paletteColorButtonActive}` : ''}${isTaken ? ` ${styles.paletteColorButtonTaken}` : ''}`}
                      style={{ '--palette-color': paletteColor } as CSSProperties}
                      onClick={() => setDentistColor(paletteColor)}
                      disabled={isSubmitting || isTaken}
                      aria-pressed={isSelected}
                      title={isTaken ? `${paletteColor} este deja folosita` : paletteColor}
                    >
                      <span className={styles.paletteColorSwatch} aria-hidden="true" />
                      <span>{paletteColor}</span>
                    </button>
                  );
                })}
              </div>
              <p className={styles.fieldHint}>
                Fiecare dentist din calendar trebuie sa aiba o culoare unica. Pending si acceptat rezerva culoarea.
              </p>
              {ownerNeedsPaletteNormalization && (
                <div className={styles.clientSuggestionError}>
                  Ownerul foloseste o culoare veche. Inainte sa adaugi sau modifici partajari, alege in setari o culoare presetata pentru acest calendar.
                </div>
              )}
              {paletteExhausted && (
                <div className={styles.clientSuggestionError}>
                  Toate culorile presetate sunt deja folosite pe acest calendar.
                </div>
              )}
            </div>

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
                        onChange={(event) => setPermission(option.key, event.target.checked)}
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
                {isSubmitting
                  ? 'Se salveaza...'
                  : isEditing
                    ? 'Actualizeaza accesul'
                    : 'Trimite invitatia'}
              </button>
            </div>
          </section>

          <section className={styles.modalSectionCard}>
            <div className={styles.modalSectionHeader}>
              <div>
                <h4 className={styles.modalSectionTitle}>Partajari existente</h4>
                <p className={styles.modalSectionMeta}>
                  Gestionezi cine poate vedea si modifica programarile din acest calendar.
                </p>
              </div>
              <span className={styles.shareCountBadge}>{shares.length}</span>
            </div>

            {loadingShares ? (
              <div className={styles.emptyStateCard}>Se incarca partajarile...</div>
            ) : shares.length === 0 ? (
              <div className={styles.emptyStateCard}>
                Nu exista invitatii sau partajari pentru acest calendar.
              </div>
            ) : (
              <div className={styles.shareList}>
                {shares.map((share) => (
                  <article key={share.id} className={styles.shareCard}>
                    <div className={styles.shareCardHeader}>
                      <div className={styles.shareIdentity}>
                        <div className={styles.shareIdentityTop}>
                          <span className={styles.inlineCalendarDot} style={{ backgroundColor: share.dentist_color || calendar.color }} />
                          <strong>
                            {share.recipientName || share.dentist_display_name || share.shared_with_email}
                          </strong>
                        </div>
                        <span className={styles.shareIdentityMeta}>{share.shared_with_email}</span>
                      </div>
                      <span className={`${styles.shareStatusBadge} ${getStatusClass(share.status)}`}>
                        {getStatusLabel(share.status)}
                      </span>
                    </div>

                    <p className={styles.sharePermissionsSummary}>
                      Permisiuni: {formatPermissionsSummary(share.permissions)}
                    </p>

                    {share.accepted_at && (
                      <p className={styles.shareTimestamp}>
                        Acceptat la {new Date(share.accepted_at).toLocaleDateString('ro-RO')}
                      </p>
                    )}

                    <div className={styles.shareCardActions}>
                      <button
                        type="button"
                        className={styles.secondaryInlineAction}
                        onClick={() => handleEditShare(share)}
                        disabled={processingShareId === share.id || isSubmitting}
                      >
                        Editeaza
                      </button>
                      <button
                        type="button"
                        className={styles.dangerInlineAction}
                        onClick={() => void handleDeleteShare(share)}
                        disabled={processingShareId === share.id || isSubmitting}
                      >
                        {processingShareId === share.id ? 'Se proceseaza...' : share.status === 'accepted' ? 'Revoca' : 'Sterge'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
