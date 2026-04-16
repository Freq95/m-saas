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
  type SentPendingShare,
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
  if (permissions.can_create) parts.push('creare');
  if (permissions.can_edit_all) parts.push('editare');
  else if (permissions.can_edit_own) parts.push('editare proprii');
  if (permissions.can_delete_all) parts.push('stergere');
  else if (permissions.can_delete_own) parts.push('stergere proprii');
  return parts.join(', ');
}

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
    sentShares,
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
    () => new Map<number, CalendarListItem>(calendars.map((c) => [c.id, c])),
    [calendars]
  );

  const [showCalendarFormModal, setShowCalendarFormModal] = useState(false);
  const [calendarFormMode, setCalendarFormMode] = useState<'create' | 'edit'>('create');
  const [calendarFormTarget, setCalendarFormTarget] = useState<CalendarListItem | null>(null);
  const [showShareCalendarModal, setShowShareCalendarModal] = useState(false);
  const [shareCalendarTarget, setShareCalendarTarget] = useState<CalendarListItem | null>(null);
  const [removingShareId, setRemovingShareId] = useState<number | null>(null);
  const [revokingShareId, setRevokingShareId] = useState<number | null>(null);

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
      toast.warning('Doar ownerul calendarului poate edita.');
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

  const handleRevokeSentShare = async (share: SentPendingShare) => {
    const calendar = calendarMap.get(share.calendar_id);
    const label = share.dentist_display_name || share.shared_with_email;
    const confirmed = window.confirm(`Revoci invitatia trimisa catre ${label}?`);
    if (!confirmed) return;
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
      toast.success('Invitatia a fost revocata.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut revoca invitatia.');
    } finally {
      setRevokingShareId(null);
    }
  };

  const handleLeaveCalendar = async (calendarId: number, shareId: number) => {
    const calendar = calendarMap.get(calendarId);
    if (!calendar?.shareId) return;
    const confirmed = window.confirm(`Parasesti calendarul partajat "${calendar.name}"?`);
    if (!confirmed) return;
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

  const isLoading = calendarsLoading && calendars.length === 0;
  const isEmpty = !isLoading && ownCalendars.length === 0 && sharedCalendars.length === 0 && pendingShares.length === 0 && sentShares.length === 0;
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

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Calendar</th>
                <th className={styles.colType}>Tip</th>
                <th className={styles.colInfo}>Detalii</th>
                <th className={styles.colActions} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} className={styles.stateRow}>Se incarca...</td>
                </tr>
              ) : isEmpty ? (
                <tr>
                  <td colSpan={4} className={styles.stateRow}>
                    Niciun calendar.{' '}
                    {canManageCalendars && (
                      <button type="button" className={styles.inlineLink} onClick={openCreateCalendarModal}>
                        Creeaza primul calendar
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                <>
                  {ownCalendars.length > 0 && (
                    <>
                      <tr className={styles.sectionRow}>
                        <td colSpan={4}>Calendarele mele</td>
                      </tr>
                      {ownCalendars.map((calendar) => (
                        <tr key={calendar.id} className={styles.row}>
                          <td>
                            <div className={styles.calNameCell}>
                              <span
                                className={styles.colorDot}
                                style={{ background: `linear-gradient(135deg, ${calendar.color_mine} 50%, ${calendar.color_others} 50%)` }}
                                aria-hidden="true"
                              />
                              <span className={styles.calName}>{calendar.name}</span>
                              {calendar.is_default && (
                                <span className={styles.tag}>Implicit</span>
                              )}
                            </div>
                          </td>
                          <td className={styles.colType}>
                            <span className={styles.badge}>Propriu</span>
                          </td>
                          <td className={styles.colInfo}>
                            <span className={styles.cellEmpty}>—</span>
                          </td>
                          <td>
                            <div className={styles.actionGroup}>
                              <button
                                type="button"
                                className={styles.iconButton}
                                onClick={() => openEditCalendarModal(calendar.id)}
                                title="Setari"
                                aria-label={`Editeaza ${calendar.name}`}
                              >
                                <IconEdit />
                              </button>
                              <button
                                type="button"
                                className={styles.iconButton}
                                onClick={() => openShareCalendarModal(calendar.id)}
                                title="Partajare"
                                aria-label={`Partajeaza ${calendar.name}`}
                              >
                                <IconShare />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}

                  {sharedCalendars.length > 0 && (
                    <>
                      <tr className={styles.sectionRow}>
                        <td colSpan={4}>Partajate cu mine</td>
                      </tr>
                      {sharedCalendars.map((calendar) => (
                        <tr key={calendar.id} className={styles.row}>
                          <td>
                            <div className={styles.calNameCell}>
                              <span
                                className={styles.colorDot}
                                style={{ background: `linear-gradient(135deg, ${calendar.color_mine} 50%, ${calendar.color_others} 50%)` }}
                                aria-hidden="true"
                              />
                              <span className={styles.calName}>{calendar.name}</span>
                            </div>
                          </td>
                          <td className={styles.colType}>
                            <span className={styles.badgeMuted}>Partajat</span>
                          </td>
                          <td className={styles.colInfo}>
                            <span className={styles.cellMuted}>
                              {calendar.sharedByName ? `${calendar.sharedByName} · ` : ''}
                              {formatPermissionsSummary(calendar.permissions)}
                            </span>
                          </td>
                          <td>
                            <div className={styles.actionGroup}>
                              <button
                                type="button"
                                className={styles.iconButtonDanger}
                                onClick={() => {
                                  if (calendar.shareId) {
                                    void handleLeaveCalendar(calendar.id, calendar.shareId);
                                  }
                                }}
                                disabled={!calendar.shareId || removingShareId === calendar.shareId}
                                title="Paraseste calendarul"
                                aria-label={`Paraseste ${calendar.name}`}
                              >
                                <IconLeave />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}

                  {sentCount > 0 && (
                    <>
                      <tr className={styles.sectionRow}>
                        <td colSpan={4}>Invitatii trimise</td>
                      </tr>
                      {sentShares.map((share) => {
                        const cal = calendarMap.get(share.calendar_id);
                        return (
                          <tr key={share.id} className={styles.row}>
                            <td>
                              <div className={styles.calNameCell}>
                                {cal && (
                                  <span
                                    className={styles.colorDot}
                                    style={{ background: `linear-gradient(135deg, ${cal.color_mine} 50%, ${cal.color_others} 50%)` }}
                                    aria-hidden="true"
                                  />
                                )}
                                <span className={styles.calName}>{cal?.name ?? `Calendar #${share.calendar_id}`}</span>
                              </div>
                            </td>
                            <td className={styles.colType}>
                              <span className={styles.badgeSent}>Trimis</span>
                            </td>
                            <td className={styles.colInfo}>
                              <span className={styles.cellMuted}>
                                {share.dentist_display_name && share.dentist_display_name !== share.shared_with_email
                                  ? `${share.dentist_display_name} · ${share.shared_with_email}`
                                  : share.shared_with_email}
                              </span>
                            </td>
                            <td>
                              <div className={styles.actionGroup}>
                                <button
                                  type="button"
                                  className={styles.iconButtonDanger}
                                  onClick={() => void handleRevokeSentShare(share)}
                                  disabled={revokingShareId === share.id}
                                  title="Revoca invitatia"
                                  aria-label={`Revoca invitatia pentru ${share.shared_with_email}`}
                                >
                                  <IconX />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}

                  {pendingCount > 0 && (
                    <>
                      <tr className={styles.sectionRow}>
                        <td colSpan={4}>Invitatii primite</td>
                      </tr>
                      {pendingSharesLoading && pendingShares.length === 0 ? (
                        <tr>
                          <td colSpan={4} className={styles.stateRow}>Se incarca...</td>
                        </tr>
                      ) : (
                        pendingShares.map((share) => (
                          <tr key={share.id} className={styles.row}>
                            <td>
                              <div className={styles.calNameCell}>
                                <span
                                  className={styles.colorDot}
                                  style={{ background: `linear-gradient(135deg, ${share.calendar.color_mine} 50%, ${share.calendar.color_others} 50%)` }}
                                  aria-hidden="true"
                                />
                                <span className={styles.calName}>{share.calendar.name}</span>
                              </div>
                            </td>
                            <td className={styles.colType}>
                              <span className={styles.badgePending}>Invitatie</span>
                            </td>
                            <td className={styles.colInfo}>
                              {share.shared_by_name
                                ? <span className={styles.cellMuted}>{share.shared_by_name}</span>
                                : <span className={styles.cellEmpty}>—</span>
                              }
                            </td>
                            <td>
                              <div className={styles.actionGroup}>
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
                                  className={styles.connectBtn}
                                  onClick={() => handleAcceptPendingShare(share.id)}
                                  disabled={actionShareId === share.id}
                                  aria-label={`Accepta invitatia la ${share.calendar.name}`}
                                >
                                  {actionShareId === share.id ? '...' : 'Accepta'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
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
