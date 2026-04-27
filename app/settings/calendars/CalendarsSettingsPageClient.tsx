'use client';

import { useMemo, useState } from 'react';
import { ToastContainer } from '@/components/Toast';
import { useToast } from '@/lib/useToast';
import navStyles from '../../dashboard/page.module.css';
import sharedStyles from '../services/page.module.css';
import styles from './page.module.css';
import SettingsTabs from '../SettingsTabs';
import { DENTIST_COLOR_PALETTE } from '@/lib/calendar-color-policy';
import {
  useCalendarList,
  usePendingShares,
  type CalendarListItem,
  type SentPendingShare,
} from '../../calendar/hooks';
import {
  CalendarFormModal,
  ConfirmModal,
  ShareCalendarModal,
} from '../../calendar/components';
import type { CalendarFormValues } from '../../calendar/components/modals/CalendarFormModal';

interface CalendarsSettingsPageClientProps {
  initialRole: string;
  initialUserId: number;
  initialCalendarList?: {
    ownCalendars: any[];
    sharedCalendars: any[];
    sentPendingShares: any[];
  } | null;
  initialPendingShareList?: {
    pendingShares: any[];
  } | null;
}

// ── Inline palette color picker ────────────────────────────────────────────

interface CalendarColorPickerProps {
  currentColorId: string | null | undefined;
  takenColors: string[];
  saving: boolean;
  onPick: (colorId: string) => void;
}

function CalendarColorPicker({ currentColorId, takenColors, saving, onPick }: CalendarColorPickerProps) {
  return (
    <div className={styles.colorPalette} role="group" aria-label="Culoarea calendarului">
      {DENTIST_COLOR_PALETTE.map((c) => {
        const isSelected = currentColorId === c.id;
        const isTaken = takenColors.includes(c.id) && !isSelected;
        return (
          <button
            key={c.id}
            type="button"
            className={`${styles.colorSwatch} ${isSelected ? styles.colorSwatchSelected : ''} ${isTaken ? styles.colorSwatchTaken : ''}`}
            style={{ background: c.hex }}
            onClick={() => !isTaken && !saving && onPick(c.id)}
            disabled={saving}
            aria-label={`${c.label}${isTaken ? ' — folosita deja' : ''}${isSelected ? ' — selectata' : ''}`}
            aria-pressed={isSelected}
            title={isTaken ? `${c.label} — folosita deja` : c.label}
          >
            {isSelected && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Icon components ────────────────────────────────────────────────────────

const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const IconShare = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);

const IconLeave = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── Page component ─────────────────────────────────────────────────────────

export default function CalendarsSettingsPageClient({
  initialRole,
  initialUserId: _initialUserId,
  initialCalendarList,
  initialPendingShareList,
}: CalendarsSettingsPageClientProps) {
  const toast = useToast();
  const canManageCalendars = initialRole === 'owner';

  const {
    ownCalendars,
    sharedCalendars,
    calendars,
    sentShares,
    loading: calendarsLoading,
    error: calendarsError,
    refetch: refetchCalendars,
  } = useCalendarList({ fallbackData: initialCalendarList ?? undefined });

  const {
    pendingShares,
    loading: pendingSharesLoading,
    error: pendingSharesError,
    actionShareId,
    acceptShare,
    declineShare,
    refetch: refetchPendingShares,
  } = usePendingShares({ fallbackData: initialPendingShareList ?? undefined });

  const calendarMap = useMemo(
    () => new Map<number, CalendarListItem>(calendars.map((c) => [c.id, c])),
    [calendars]
  );

  // Track which calendar's color is being saved
  const [savingColorCalendarId, setSavingColorCalendarId] = useState<number | null>(null);
  const [savingColorShareId, setSavingColorShareId] = useState<number | null>(null);

  const [showCalendarFormModal, setShowCalendarFormModal] = useState(false);
  const [calendarFormMode, setCalendarFormMode] = useState<'create' | 'edit'>('create');
  const [calendarFormTarget, setCalendarFormTarget] = useState<CalendarListItem | null>(null);
  const [showShareCalendarModal, setShowShareCalendarModal] = useState(false);
  const [shareCalendarTarget, setShareCalendarTarget] = useState<CalendarListItem | null>(null);
  const [removingShareId, setRemovingShareId] = useState<number | null>(null);
  const [revokingShareId, setRevokingShareId] = useState<number | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<SentPendingShare | null>(null);
  const [pendingLeave, setPendingLeave] = useState<{ calendarId: number; shareId: number; name: string } | null>(null);

  // ── Color save handlers ────────────────────────────────────────────────

  const handleOwnCalendarColorPick = async (calendarId: number, colorId: string) => {
    setSavingColorCalendarId(calendarId);
    try {
      const res = await fetch(`/api/calendars/${calendarId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color_mine: colorId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Nu am putut salva culoarea.');
      await refetchCalendars();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva culoarea.');
    } finally {
      setSavingColorCalendarId(null);
    }
  };

  const handleSharedCalendarColorPick = async (calendarId: number, shareId: number, colorId: string) => {
    setSavingColorShareId(shareId);
    try {
      const res = await fetch(`/api/calendars/${calendarId}/shares/${shareId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dentist_color: colorId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Nu am putut salva culoarea.');
      await refetchCalendars();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva culoarea.');
    } finally {
      setSavingColorShareId(null);
    }
  };

  // ── Modal handlers ─────────────────────────────────────────────────────

  const openCreateCalendarModal = () => {
    if (!canManageCalendars) {
      toast.warning('Doar ownerul clinicii poate crea calendare noi.');
      return;
    }
    setCalendarFormMode('create');
    setCalendarFormTarget(null);
    setShowCalendarFormModal(true);
  };

  const openEditCalendarModal = (calendarId: number) => {
    const calendar = calendarMap.get(calendarId) || null;
    if (!calendar || !calendar.isOwner) {
      toast.warning('Doar ownerul calendarului poate redenumi.');
      return;
    }
    setCalendarFormMode('edit');
    setCalendarFormTarget(calendar);
    setShowCalendarFormModal(true);
  };

  const openShareCalendarModal = (calendarId: number) => {
    const calendar = calendarMap.get(calendarId) || null;
    if (!calendar || !calendar.isOwner) {
      toast.warning('Doar ownerul calendarului poate gestiona partajarile.');
      return;
    }
    setShareCalendarTarget(calendar);
    setShowShareCalendarModal(true);
  };

  const handleAcceptPendingShare = async (shareId: number) => {
    const result = await acceptShare(shareId);
    if (!result.ok) {
      toast.error(result.error || 'Nu am putut accepta invitatia.');
      return;
    }
    await Promise.all([refetchCalendars(), refetchPendingShares()]);
    toast.success('Calendarul partajat a fost adaugat.');
  };

  const handleDeclinePendingShare = async (shareId: number) => {
    const result = await declineShare(shareId);
    if (!result.ok) {
      toast.error(result.error || 'Nu am putut refuza invitatia.');
      return;
    }
    await refetchPendingShares();
    toast.info('Invitatia a fost refuzata.');
  };

  const handleCalendarFormSubmit = async (payload: CalendarFormValues) => {
    const response = await fetch(
      calendarFormMode === 'edit' && calendarFormTarget
        ? `/api/calendars/${calendarFormTarget.id}`
        : '/api/calendars',
      {
        method: calendarFormMode === 'edit' ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || 'Nu am putut salva calendarul.');
    }
    await refetchCalendars();
    setShowCalendarFormModal(false);
    setCalendarFormTarget(null);
    toast.success(calendarFormMode === 'edit' ? 'Calendar actualizat.' : 'Calendar creat.');
  };

  const handleCalendarDelete = async () => {
    if (!calendarFormTarget) return;
    const response = await fetch(`/api/calendars/${calendarFormTarget.id}`, {
      method: 'DELETE',
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || 'Nu am putut sterge calendarul.');
    }
    await refetchCalendars();
    setShowCalendarFormModal(false);
    setCalendarFormTarget(null);
    toast.success('Calendar sters.');
  };

  const handleRevokeSentShare = (share: SentPendingShare) => {
    setPendingRevoke(share);
  };

  const confirmRevokeSentShare = async () => {
    if (!pendingRevoke) return;
    const share = pendingRevoke;
    setRevokingShareId(share.id);
    try {
      const response = await fetch(
        `/api/calendars/${share.calendar_id}/shares/${share.id}`,
        { method: 'DELETE' }
      );
      if (!response.ok && response.status !== 204) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Nu am putut revoca invitatia.');
      }
      await refetchCalendars();
      setPendingRevoke(null);
      toast.success('Invitatia a fost revocata.');
    } finally {
      setRevokingShareId(null);
    }
  };

  const handleLeaveCalendar = (calendarId: number, shareId: number) => {
    const calendar = calendarMap.get(calendarId);
    if (!calendar?.shareId) return;
    setPendingLeave({ calendarId, shareId, name: calendar.name });
  };

  const confirmLeaveCalendar = async () => {
    if (!pendingLeave) return;
    const { calendarId, shareId } = pendingLeave;
    setRemovingShareId(shareId);
    try {
      const response = await fetch(`/api/calendars/${calendarId}/shares/${shareId}`, {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 204) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || 'Nu am putut parasi calendarul.');
      }
      await refetchCalendars();
      setPendingLeave(null);
      toast.success('Ai parasit calendarul partajat.');
    } finally {
      setRemovingShareId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const isLoading = calendarsLoading && calendars.length === 0;
  const pendingCount = pendingShares.length;
  const sentCount = sentShares.length;

  return (
    <div className={navStyles.container}>
      <div className={sharedStyles.container}>
        <div className={styles.tabRow}>
          <SettingsTabs activeTab="calendars" />
          <div className={styles.tabRowRight}>
            {pendingCount > 0 && (
              <span className={styles.pendingNote}>
                {pendingCount} invitatie{pendingCount !== 1 ? 'i' : ''} in asteptare
              </span>
            )}
            <button
              type="button"
              className={sharedStyles.primaryButton}
              onClick={openCreateCalendarModal}
              disabled={!canManageCalendars}
              title={canManageCalendars ? undefined : 'Doar ownerul poate crea calendare'}
            >
              + Calendar
            </button>
          </div>
        </div>

        {(calendarsError || pendingSharesError) && (
          <div className={styles.errorStack}>
            {calendarsError && <p className={sharedStyles.error}>{calendarsError}</p>}
            {pendingSharesError && <p className={sharedStyles.error}>{pendingSharesError}</p>}
          </div>
        )}

        {isLoading ? (
          <p className={styles.loadingText}>Se incarca...</p>
        ) : (
          <>
            {/* ── Own calendars ── */}
            {ownCalendars.length > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Calendarele mele</h3>
                <div className={styles.cardList}>
                  {ownCalendars.map((calendar) => (
                    <div key={calendar.id} className={styles.card}>
                      <div className={styles.cardMain}>
                        <div className={styles.cardInfo}>
                          <span className={styles.calName}>{calendar.name}</span>
                          {calendar.is_default && (
                            <span className={styles.tag}>Implicit</span>
                          )}
                        </div>
                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => openEditCalendarModal(calendar.id)}
                            title="Redenumeste"
                            aria-label={`Redenumeste ${calendar.name}`}
                          >
                            <IconEdit />
                          </button>
                          {!calendar.is_default && (
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={() => openShareCalendarModal(calendar.id)}
                              title="Partajare"
                              aria-label={`Partajeaza ${calendar.name}`}
                            >
                              <IconShare />
                            </button>
                          )}
                        </div>
                      </div>

                      {!calendar.is_default && (
                        <div className={styles.cardColor}>
                          <span className={styles.colorLabel}>Culoarea mea</span>
                          <CalendarColorPicker
                            currentColorId={calendar.ownerColorId}
                            takenColors={calendar.takenColors ?? []}
                            saving={savingColorCalendarId === calendar.id}
                            onPick={(colorId) => handleOwnCalendarColorPick(calendar.id, colorId)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── Shared calendars ── */}
            {sharedCalendars.length > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Partajate cu mine</h3>
                <div className={styles.cardList}>
                  {sharedCalendars.map((calendar) => (
                    <div key={calendar.id} className={styles.card}>
                      <div className={styles.cardMain}>
                        <div className={styles.cardInfo}>
                          <span className={styles.calName}>{calendar.name}</span>
                          {calendar.sharedByName && (
                            <span className={styles.cardMeta}>de {calendar.sharedByName}</span>
                          )}
                        </div>
                        <div className={styles.cardActions}>
                          <button
                            type="button"
                            className={styles.iconButtonDanger}
                            onClick={() => {
                              if (calendar.shareId) {
                                handleLeaveCalendar(calendar.id, calendar.shareId);
                              }
                            }}
                            disabled={!calendar.shareId || removingShareId === calendar.shareId}
                            title="Paraseste calendarul"
                            aria-label={`Paraseste ${calendar.name}`}
                          >
                            <IconLeave />
                          </button>
                        </div>
                      </div>

                      <div className={styles.cardColor}>
                        <span className={styles.colorLabel}>Culoarea mea</span>
                        <CalendarColorPicker
                          currentColorId={calendar.dentistColorId}
                          takenColors={calendar.takenColors ?? []}
                          saving={savingColorShareId === calendar.shareId}
                          onPick={(colorId) => {
                            if (calendar.shareId) {
                              handleSharedCalendarColorPick(calendar.id, calendar.shareId, colorId);
                            }
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {ownCalendars.length === 0 && sharedCalendars.length === 0 && pendingCount === 0 && (
              <div className={styles.emptyState}>
                <p>Niciun calendar.</p>
                {canManageCalendars && (
                  <button type="button" className={styles.inlineLink} onClick={openCreateCalendarModal}>
                    Creeaza primul calendar
                  </button>
                )}
              </div>
            )}

            {/* ── Sent invites ── */}
            {sentCount > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Invitatii trimise</h3>
                <div className={styles.inviteList}>
                  {sentShares.map((share) => {
                    const cal = calendarMap.get(share.calendar_id);
                    return (
                      <div key={share.id} className={styles.inviteRow}>
                        <div className={styles.inviteInfo}>
                          <span className={styles.inviteCal}>{cal?.name ?? `Calendar #${share.calendar_id}`}</span>
                          <span className={styles.inviteEmail}>
                            {share.dentist_display_name && share.dentist_display_name !== share.shared_with_email
                              ? `${share.dentist_display_name} · ${share.shared_with_email}`
                              : share.shared_with_email}
                          </span>
                        </div>
                        <span className={styles.badgeSent}>In asteptare</span>
                        <button
                          type="button"
                          className={styles.iconButtonDanger}
                          onClick={() => handleRevokeSentShare(share)}
                          disabled={revokingShareId === share.id}
                          title="Revoca invitatia"
                          aria-label={`Revoca invitatia pentru ${share.shared_with_email}`}
                        >
                          <IconX />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Received invites ── */}
            {pendingCount > 0 && (
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Invitatii primite</h3>
                {pendingSharesLoading && pendingShares.length === 0 ? (
                  <p className={styles.loadingText}>Se incarca...</p>
                ) : (
                  <div className={styles.inviteList}>
                    {pendingShares.map((share) => (
                      <div key={share.id} className={styles.inviteRow}>
                        <div className={styles.inviteInfo}>
                          <span className={styles.inviteCal}>{share.calendar.name}</span>
                          {share.shared_by_name && (
                            <span className={styles.inviteEmail}>de {share.shared_by_name}</span>
                          )}
                        </div>
                        <span className={styles.badgePending}>Invitatie</span>
                        <div className={styles.inviteActions}>
                          <button
                            type="button"
                            className={styles.iconButtonDanger}
                            onClick={() => handleDeclinePendingShare(share.id)}
                            disabled={actionShareId === share.id}
                            title="Refuza"
                            aria-label={`Refuza invitatia la ${share.calendar.name}`}
                          >
                            <IconX />
                          </button>
                          <button
                            type="button"
                            className={styles.acceptBtn}
                            onClick={() => handleAcceptPendingShare(share.id)}
                            disabled={actionShareId === share.id}
                            aria-label={`Accepta invitatia la ${share.calendar.name}`}
                          >
                            {actionShareId === share.id ? '...' : 'Accepta'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <CalendarFormModal
        isOpen={showCalendarFormModal}
        mode={calendarFormMode}
        calendar={calendarFormTarget}
        onClose={() => {
          setShowCalendarFormModal(false);
          setCalendarFormTarget(null);
        }}
        onSubmit={handleCalendarFormSubmit}
        onDelete={calendarFormMode === 'edit' ? handleCalendarDelete : undefined}
      />

      <ShareCalendarModal
        isOpen={showShareCalendarModal}
        calendar={shareCalendarTarget}
        onClose={() => {
          setShowShareCalendarModal(false);
          setShareCalendarTarget(null);
        }}
        onChanged={async () => {
          await Promise.all([refetchCalendars(), refetchPendingShares()]);
        }}
      />

      <ConfirmModal
        isOpen={pendingRevoke !== null}
        title="Revocare invitatie"
        message={
          pendingRevoke
            ? `Revoci invitatia trimisa catre ${pendingRevoke.dentist_display_name || pendingRevoke.shared_with_email}?`
            : ''
        }
        confirmLabel="Revoca"
        tone="danger"
        onClose={() => setPendingRevoke(null)}
        onConfirm={confirmRevokeSentShare}
      />

      <ConfirmModal
        isOpen={pendingLeave !== null}
        title="Parasire calendar partajat"
        message={pendingLeave ? `Parasesti calendarul partajat "${pendingLeave.name}"?` : ''}
        confirmLabel="Paraseste"
        tone="danger"
        onClose={() => setPendingLeave(null)}
        onConfirm={confirmLeaveCalendar}
      />

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
