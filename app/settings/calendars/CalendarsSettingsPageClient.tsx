'use client';

import { useMemo, useState } from 'react';
import { ToastContainer } from '@/components/Toast';
import { useToast } from '@/lib/useToast';
import navStyles from '../../dashboard/page.module.css';
import sharedStyles from '../services/page.module.css';
import styles from './page.module.css';
import SettingsTabs from '../SettingsTabs';
import {
  useCalendarList,
  usePendingShares,
  type CalendarListItem,
  type CalendarPermissions,
} from '../../calendar/hooks';
import {
  CalendarFormModal,
  ShareCalendarModal,
} from '../../calendar/components';
import type { CalendarFormValues } from '../../calendar/components/modals/CalendarFormModal';

interface CalendarsSettingsPageClientProps {
  initialRole: string;
  initialUserId: number;
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

function buildCalendarDescription(calendar: CalendarListItem): string {
  const typeLabel = 'Calendar personal';
  if (calendar.isOwner) {
    return typeLabel;
  }

  if (calendar.sharedByName) {
    return `${typeLabel} - Partajat de ${calendar.sharedByName}`;
  }

  return typeLabel;
}

export default function CalendarsSettingsPageClient({
  initialRole,
  initialUserId: _initialUserId,
}: CalendarsSettingsPageClientProps) {
  const toast = useToast();
  const canManageCalendars = initialRole === 'owner';
  const {
    ownCalendars,
    sharedCalendars,
    calendars,
    loading: calendarsLoading,
    error: calendarsError,
    refetch: refetchCalendars,
  } = useCalendarList();
  const {
    pendingShares,
    loading: pendingSharesLoading,
    error: pendingSharesError,
    actionShareId,
    acceptShare,
    declineShare,
    refetch: refetchPendingShares,
  } = usePendingShares();

  const calendarMap = useMemo(
    () => new Map<number, CalendarListItem>(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars]
  );

  const [showCalendarFormModal, setShowCalendarFormModal] = useState(false);
  const [calendarFormMode, setCalendarFormMode] = useState<'create' | 'edit'>('create');
  const [calendarFormTarget, setCalendarFormTarget] = useState<CalendarListItem | null>(null);
  const [showShareCalendarModal, setShowShareCalendarModal] = useState(false);
  const [shareCalendarTarget, setShareCalendarTarget] = useState<CalendarListItem | null>(null);
  const [removingShareId, setRemovingShareId] = useState<number | null>(null);

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
      toast.warning('Doar ownerul calendarului poate edita acest calendar.');
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
        body: JSON.stringify(
          calendarFormMode === 'edit'
            ? {
                name: payload.name,
                color: payload.color,
                colorMode: payload.colorMode,
              }
            : payload
        ),
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
    if (!calendarFormTarget) {
      return;
    }

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

  const handleLeaveCalendar = async (calendarId: number, shareId: number) => {
    const calendar = calendarMap.get(calendarId);
    if (!calendar?.shareId) {
      return;
    }

    const confirmed = window.confirm(`Parasesti calendarul partajat "${calendar.name}"?`);
    if (!confirmed) {
      return;
    }

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
      toast.success('Ai parasit calendarul partajat.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut parasi calendarul.');
    } finally {
      setRemovingShareId(null);
    }
  };

  const showLoadingState = calendarsLoading && calendars.length === 0;

  return (
    <div className={navStyles.container}>
      <div className={sharedStyles.container}>
        <div className={sharedStyles.tabRow}>
          <SettingsTabs activeTab="calendars" />
          <div className={styles.headerActions}>
            <button
              type="button"
              className={sharedStyles.primaryButton}
              onClick={openCreateCalendarModal}
              disabled={!canManageCalendars}
            >
              + Calendar
            </button>
          </div>
        </div>

        <p className={sharedStyles.description}>
          Gestionezi aici toate calendarele si invitatiile. Pagina de calendar ramane
          concentrata doar pe programari si selectie rapida.
        </p>

        {!canManageCalendars && (
          <div className={styles.noticeCard}>
            Poti vedea calendarele partajate cu tine, poti accepta invitatii si poti parasi un
            calendar partajat. Crearea si editarea calendarelor raman disponibile doar ownerului.
          </div>
        )}

        <div className={styles.colorInfoCard}>
          <h2>Despre culori</h2>
          <p>
            Calendarul implicit poate pastra culorile pe categorii. Pentru calendarele
            non-implicite, programarile folosesc culoarea calendarului ales in setari. In modul
            <strong> Dentisti</strong>, ownerul si dentistii partajati folosesc culori unice dintr-o
            paleta presetata, iar programarile se coloreaza dupa dentistul asignat.
          </p>
        </div>

        {(calendarsError || pendingSharesError) && (
          <div className={styles.errorStack}>
            {calendarsError && <p className={sharedStyles.error}>{calendarsError}</p>}
            {pendingSharesError && <p className={sharedStyles.error}>{pendingSharesError}</p>}
          </div>
        )}

        {showLoadingState ? (
          <div className={styles.loadingCard}>Se incarca calendarele...</div>
        ) : (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Calendarele mele</h2>
                  <p>Calendarele pe care le detii si pe care le poti configura.</p>
                </div>
                <span className={styles.sectionCount}>{ownCalendars.length}</span>
              </div>

              {ownCalendars.length === 0 ? (
                <div className={sharedStyles.emptyState}>
                  <p>Niciun calendar propriu creat inca.</p>
                  {canManageCalendars && (
                    <button
                      type="button"
                      className={sharedStyles.primaryButton}
                      onClick={openCreateCalendarModal}
                    >
                      + Creeaza primul calendar
                    </button>
                  )}
                </div>
              ) : (
                <div className={styles.cardList}>
                  {ownCalendars.map((calendar) => (
                    <article key={calendar.id} className={styles.calendarCard}>
                      <div className={styles.calendarCardMain}>
                        <span
                          className={styles.colorSwatch}
                          style={{ backgroundColor: calendar.color }}
                          aria-hidden="true"
                        />
                        <div className={styles.calendarCardCopy}>
                          <div className={styles.calendarTitleRow}>
                            <h3>{calendar.name}</h3>
                            <div className={styles.badgeRow}>
                              <span className={styles.badge}>Propriu</span>
                              {calendar.is_default && (
                                <span className={styles.badgeMuted}>Implicit</span>
                              )}
                              {calendar.settings?.color_mode === 'dentist' && (
                                <span className={styles.badgeMuted}>Dentisti</span>
                              )}
                            </div>
                          </div>
                          <p>{buildCalendarDescription(calendar)}</p>
                        </div>
                      </div>

                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={sharedStyles.secondaryButton}
                          onClick={() => openEditCalendarModal(calendar.id)}
                        >
                          Setari
                        </button>
                        <button
                          type="button"
                          className={sharedStyles.secondaryButton}
                          onClick={() => openShareCalendarModal(calendar.id)}
                        >
                          Partajare
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Invitatii in asteptare</h2>
                  <p>Accepti sau refuzi calendarele partajate cu tine.</p>
                </div>
                <span className={styles.sectionCount}>{pendingShares.length}</span>
              </div>

              {pendingSharesLoading && pendingShares.length === 0 ? (
                <div className={styles.loadingCard}>Se incarca invitatiile...</div>
              ) : pendingShares.length === 0 ? (
                <div className={sharedStyles.emptyState}>
                  <p>Nu ai invitatii in asteptare.</p>
                </div>
              ) : (
                <div className={styles.cardList}>
                  {pendingShares.map((share) => (
                    <article key={share.id} className={styles.calendarCard}>
                      <div className={styles.calendarCardMain}>
                        <span
                          className={styles.colorSwatch}
                          style={{ backgroundColor: share.calendar.color }}
                          aria-hidden="true"
                        />
                        <div className={styles.calendarCardCopy}>
                          <div className={styles.calendarTitleRow}>
                            <h3>{share.calendar.name}</h3>
                            <span className={styles.badgeMuted}>In asteptare</span>
                          </div>
                          <p>
                            {share.shared_by_name
                              ? `Invitatie trimisa de ${share.shared_by_name}`
                              : 'Calendar partajat cu tine'}
                          </p>
                        </div>
                      </div>

                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={sharedStyles.secondaryButton}
                          onClick={() => handleDeclinePendingShare(share.id)}
                          disabled={actionShareId === share.id}
                        >
                          Refuza
                        </button>
                        <button
                          type="button"
                          className={sharedStyles.primaryButton}
                          onClick={() => handleAcceptPendingShare(share.id)}
                          disabled={actionShareId === share.id}
                        >
                          {actionShareId === share.id ? 'Se proceseaza...' : 'Accepta'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2>Calendare partajate cu mine</h2>
                  <p>Calendare primite de la alti membri ai clinicii.</p>
                </div>
                <span className={styles.sectionCount}>{sharedCalendars.length}</span>
              </div>

              {sharedCalendars.length === 0 ? (
                <div className={sharedStyles.emptyState}>
                  <p>Nu ai calendare partajate active.</p>
                </div>
              ) : (
                <div className={styles.cardList}>
                  {sharedCalendars.map((calendar) => (
                    <article key={calendar.id} className={styles.calendarCard}>
                      <div className={styles.calendarCardMain}>
                        <span
                          className={styles.colorSwatch}
                          style={{ backgroundColor: calendar.color }}
                          aria-hidden="true"
                        />
                        <div className={styles.calendarCardCopy}>
                          <div className={styles.calendarTitleRow}>
                            <h3>{calendar.name}</h3>
                            <span className={styles.badge}>Partajat</span>
                          </div>
                          <p>{buildCalendarDescription(calendar)}</p>
                          <p className={styles.permissionsText}>
                            Permisiuni: {formatPermissionsSummary(calendar.permissions)}
                          </p>
                        </div>
                      </div>

                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={sharedStyles.secondaryButton}
                          onClick={() => {
                            if (calendar.shareId) {
                              void handleLeaveCalendar(calendar.id, calendar.shareId);
                            }
                          }}
                          disabled={!calendar.shareId || removingShareId === calendar.shareId}
                        >
                          {removingShareId === calendar.shareId ? 'Se paraseste...' : 'Paraseste'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
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

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
