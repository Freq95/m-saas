'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  FloatingFocusManager,
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { ToastContainer } from '@/components/Toast';
import { useToast } from '@/lib/useToast';
import { ConfirmModal } from '@/app/calendar/components/modals/ConfirmModal';
import navStyles from '../../dashboard/page.module.css';
import styles from './page.module.css';
import SettingsTabs from '../SettingsTabs';
import { SettingsMobileHeader } from '../SettingsMobileHeader';
import type { TeamData, TeamMemberRow } from '@/lib/server/team';
import { RoleMigrationBanner } from '@/app/calendar/components/RoleMigrationBanner';

interface TeamSettingsPageClientProps {
  initialTeamData: TeamData | null;
  viewMode: 'edit' | 'readonly';
  isOwner?: boolean;
  /** Numeric user.id of the currently signed-in user — used to mark the "tu" tag. */
  currentUserId?: number;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'Proprietar',
  dentist: 'Dentist',
  receptionist: 'Receptioner',
  asistent: 'Asistent',
};

const EDITABLE_ROLES = ['dentist', 'asistent', 'receptionist'] as const;

const SeatThreshold = 0.8;

// Inline icons — compact, informative, calm.
const IconMore = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="6" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="12" cy="18" r="1.6" />
  </svg>
);
const IconChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IconPlus = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const IconArrowRight = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="18" y2="12" />
    <polyline points="12 6 18 12 12 18" />
  </svg>
);
const IconAlert = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconClose = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

function normalizeTeamRole(role: unknown): string {
  return role === 'staff' ? 'dentist' : String(role || 'dentist');
}

function normalizeApiMember(member: any): TeamMemberRow {
  return {
    userId: String(member.userId ?? member.user_id),
    numericUserId: typeof member.numericUserId === 'number' ? member.numericUserId : member.numeric_user_id ?? null,
    email: member.email || member.user_email || '',
    name: member.name || null,
    role: normalizeTeamRole(member.role),
    status: member.status || 'active',
    invitedAt: member.invitedAt || member.invited_at || '',
    acceptedAt: member.acceptedAt || member.accepted_at || null,
    assignedDentistUserIds: Array.isArray(member.assignedDentistUserIds)
      ? member.assignedDentistUserIds
      : Array.isArray(member.assigned_dentist_user_ids)
        ? member.assigned_dentist_user_ids
        : [],
    defaultCalendarActive: Boolean(member.defaultCalendarActive ?? member.default_calendar_active),
    calendarColor: member.calendarColor || member.calendar_color || null,
  };
}

function displayName(member: TeamMemberRow): string {
  return member.name || member.email || 'Membru';
}

interface EditPopoverProps {
  member: TeamMemberRow;
  dentists: TeamMemberRow[];
  trigger: (props: { ref: (node: HTMLElement | null) => void; onClick: () => void; isOpen: boolean }) => ReactNode;
  disabled?: boolean;
  onSave: (member: TeamMemberRow, payload: Record<string, unknown>, undoPayload: Record<string, unknown>) => Promise<void> | void;
  onRemove: (member: TeamMemberRow) => void;
}

function EditPopover({ member, dentists, trigger, disabled = false, onSave, onRemove }: EditPopoverProps) {
  const [open, setOpen] = useState(false);
  const [draftRole, setDraftRole] = useState(member.role === 'owner' ? 'owner' : normalizeTeamRole(member.role));
  const [draftAssignments, setDraftAssignments] = useState<number[]>(member.assignedDentistUserIds);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (nextOpen) => {
      if (disabled) return;
      setOpen(nextOpen);
      if (nextOpen) {
        setDraftRole(member.role === 'owner' ? 'owner' : normalizeTeamRole(member.role));
        setDraftAssignments(member.assignedDentistUserIds);
      }
    },
    placement: 'bottom-end',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(6),
      flip({ padding: 12 }),
      shift({ padding: 12 }),
      size({
        apply({ availableHeight, availableWidth, elements }) {
          // Cap popover to viewport so tall content scrolls instead of clipping.
          elements.floating.style.maxHeight = `${Math.max(220, availableHeight - 12)}px`;
          elements.floating.style.maxWidth = `${Math.max(220, Math.min(availableWidth - 12, 320))}px`;
        },
        padding: 12,
      }),
    ],
  });
  const click = useClick(context, { enabled: !disabled });
  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true });
  const role = useRole(context, { role: 'dialog' });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  const toggleAssignment = (dentistId: number) => {
    setDraftAssignments((current) => (
      current.includes(dentistId)
        ? current.filter((id) => id !== dentistId)
        : Array.from(new Set([...current, dentistId]))
    ));
  };

  const save = async () => {
    const payload: Record<string, unknown> = {};
    if (draftRole !== member.role) payload.role = draftRole;
    if (draftRole === 'asistent') {
      payload.assigned_dentist_user_ids = draftAssignments;
    } else if (member.assignedDentistUserIds.length > 0) {
      payload.assigned_dentist_user_ids = [];
    }
    await onSave(member, payload, {
      role: member.role,
      assigned_dentist_user_ids: member.assignedDentistUserIds,
    });
    setOpen(false);
  };

  return (
    <>
      {trigger({
        ref: refs.setReference,
        onClick: () => {},
        isOpen: open,
        ...getReferenceProps(),
      } as any)}
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div
              ref={refs.setFloating}
              className={styles.popover}
              style={floatingStyles}
              {...getFloatingProps()}
            >
              <div className={styles.popoverHeader}>
                <strong>{displayName(member)}</strong>
                <button type="button" className={styles.popoverClose} onClick={() => setOpen(false)} aria-label="Închide">
                  <IconClose />
                </button>
              </div>
              {member.email && <div className={styles.popoverEmail}>{member.email}</div>}

              <div className={styles.popoverField}>Rol</div>
              <div className={styles.roleRadioGroup}>
                {EDITABLE_ROLES.map((roleOption) => (
                  <label key={roleOption} className={styles.roleRadio}>
                    <input
                      type="radio"
                      name={`role-${member.userId}`}
                      value={roleOption}
                      checked={draftRole === roleOption}
                      onChange={() => setDraftRole(roleOption)}
                    />
                    <span>{ROLE_LABEL[roleOption]}</span>
                  </label>
                ))}
              </div>

              {draftRole === 'asistent' && (
                <>
                  <div className={styles.popoverField}>Lucreaza cu</div>
                  <div className={styles.dentistChecklist}>
                    {dentists.map((dentist) => {
                      const dentistId = dentist.numericUserId;
                      if (typeof dentistId !== 'number') return null;
                      return (
                        <label key={dentist.userId} className={styles.dentistCheck}>
                          <input
                            type="checkbox"
                            checked={draftAssignments.includes(dentistId)}
                            onChange={() => toggleAssignment(dentistId)}
                          />
                          <span>{displayName(dentist)}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className={styles.popoverNote}>Debifarea îl dezleagă &mdash; nu îl elimină din clinică.</p>
                </>
              )}

              <div className={styles.popoverActions}>
                <button type="button" className={styles.popoverSecondary} onClick={() => setOpen(false)}>
                  Anulează
                </button>
                <button type="button" className={styles.popoverPrimary} onClick={save}>
                  Salvează
                </button>
              </div>
              {member.role !== 'owner' && (
                <button
                  type="button"
                  className={styles.popoverDanger}
                  onClick={() => {
                    setOpen(false);
                    onRemove(member);
                  }}
                >
                  Elimina din clinica
                </button>
              )}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </>
  );
}

interface InviteSplitButtonProps {
  onInvite: (role: string) => void;
}

function InviteSplitButton({ onInvite }: InviteSplitButtonProps) {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: 'bottom-end',
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 12 }), shift({ padding: 12 })],
  });
  const click = useClick(context);
  const dismiss = useDismiss(context, { escapeKey: true, outsidePress: true });
  const role = useRole(context, { role: 'menu' });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  return (
    <div className={styles.splitWrap}>
      <button
        type="button"
        className={styles.splitMain}
        onClick={() => onInvite('dentist')}
      >
        <IconPlus />
        <span>Invita</span>
      </button>
      <button
        ref={refs.setReference}
        {...getReferenceProps()}
        type="button"
        className={`${styles.splitCaret} ${open ? styles.splitCaretOpen : ''}`}
        aria-label="Alege rol invitat"
      >
        <IconChevronDown />
      </button>
      {open && (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div ref={refs.setFloating} className={styles.menu} style={floatingStyles} {...getFloatingProps()}>
              <button type="button" className={styles.menuItem} onClick={() => { setOpen(false); onInvite('dentist'); }}>
                Invita dentist
              </button>
              <button type="button" className={styles.menuItem} onClick={() => { setOpen(false); onInvite('receptionist'); }}>
                Invita receptioner
              </button>
              <button type="button" className={styles.menuItem} onClick={() => { setOpen(false); onInvite('asistent'); }}>
                Invita asistent
              </button>
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      )}
    </div>
  );
}

export default function TeamSettingsPageClient({ initialTeamData, viewMode, isOwner, currentUserId }: TeamSettingsPageClientProps) {
  const [teamData, setTeamData] = useState<TeamData | null>(initialTeamData);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('dentist');
  const [inviteAssignments, setInviteAssignments] = useState<number[]>([]);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMemberRow | null>(null);
  const inviteFormRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();
  const isEditMode = viewMode === 'edit';

  async function patchMember(member: TeamMemberRow, payload: Record<string, unknown>) {
    if (Object.keys(payload).length === 0) return;
    const res = await fetch(`/api/team/${member.userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Nu am putut actualiza membrul.');
  }

  async function refreshTeam() {
    try {
      const res = await fetch('/api/team');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.members) {
        setTeamData({
          members: data.members.map(normalizeApiMember),
          seats: {
            used: data.seats?.used ?? 0,
            max: data.seats?.max ?? 0,
          },
        });
      }
    } catch {
      // keep current view if refresh fails
    }
  }

  const activeMembers = useMemo(
    () => teamData?.members.filter((member) => member.status !== 'removed') ?? [],
    [teamData],
  );

  const dentists = useMemo(() => activeMembers.filter((member) => (
    typeof member.numericUserId === 'number' &&
    (member.role === 'dentist' || (member.role === 'owner' && member.defaultCalendarActive))
  )), [activeMembers]);

  const dentistsById = useMemo(
    () => new Map(
      dentists
        .filter((member) => typeof member.numericUserId === 'number')
        .map((member) => [member.numericUserId as number, member]),
    ),
    [dentists],
  );

  const grouped = useMemo(() => {
    const owners = activeMembers.filter((member) => member.role === 'owner');
    const dentistRows = activeMembers.filter((member) => member.role === 'dentist');
    const receptionists = activeMembers.filter((member) => member.role === 'receptionist');
    const asistents = activeMembers.filter((member) => member.role === 'asistent');
    const orphanAsistents = asistents.filter((member) => member.assignedDentistUserIds.length === 0);
    return { owners, dentistRows, receptionists, asistents, orphanAsistents };
  }, [activeMembers]);

  function asistentsForDentist(dentistId: number | null) {
    if (typeof dentistId !== 'number') return [] as TeamMemberRow[];
    return grouped.asistents.filter((a) => a.assignedDentistUserIds.includes(dentistId));
  }

  function otherDentistNames(asistent: TeamMemberRow, currentDentistId: number) {
    return asistent.assignedDentistUserIds
      .filter((id) => id !== currentDentistId)
      .map((id) => dentistsById.get(id))
      .filter((d): d is TeamMemberRow => Boolean(d))
      .map((d) => displayName(d));
  }

  const seats = teamData?.seats;
  const seatRatio = seats && seats.max > 0 ? Math.min(1, seats.used / seats.max) : 0;
  const showSeatTrack = seatRatio >= SeatThreshold;
  const onlyOwner = activeMembers.length <= grouped.owners.length;

  async function updateMember(
    member: TeamMemberRow,
    payload: Record<string, unknown>,
    undoPayload: Record<string, unknown>,
  ) {
    setSavingMemberId(member.userId);
    try {
      await patchMember(member, payload);
      await refreshTeam();
      toast.success(`${displayName(member)} a fost actualizat.`, {
        duration: 5000,
        actionLabel: 'Anulează',
        onAction: async () => {
          try {
            await patchMember(member, undoPayload);
            await refreshTeam();
            toast.info('Schimbarea a fost anulată.');
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Nu am putut anula schimbarea.');
          }
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Nu am putut actualiza membrul.');
    } finally {
      setSavingMemberId(null);
    }
  }

  function openInvite(role: string) {
    setInviteRole(role);
    setInviteAssignments([]);
    setInviteError(null);
    setShowInviteForm(true);
  }

  // Scroll the invite form into view when it opens (mobile + dense rosters).
  useEffect(() => {
    if (showInviteForm && inviteFormRef.current) {
      inviteFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [showInviteForm]);

  async function handleInvite() {
    const email = inviteEmail.trim();
    const name = inviteName.trim();
    if (!email || !name) {
      setInviteError('Numele și emailul sunt obligatorii.');
      return;
    }
    if (inviteRole === 'asistent' && inviteAssignments.length === 0) {
      setInviteError('Selectează cel puțin un dentist.');
      return;
    }
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          role: inviteRole,
          ...(inviteRole === 'asistent' ? { assigned_dentist_user_ids: inviteAssignments } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Nu am putut trimite invitația.');
      toast.success(typeof data?.message === 'string' ? data.message : 'Invitația a fost trimisa.');
      setShowInviteForm(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('dentist');
      setInviteAssignments([]);
      await refreshTeam();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nu am putut trimite invitația.';
      setInviteError(message);
      toast.error(message);
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(member: TeamMemberRow) {
    const res = await fetch(`/api/team/${member.userId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'Nu am putut elimină membrul.');
    toast.success(`${displayName(member)} a fost eliminat din clinică.`);
    await refreshTeam();
  }

  // ---- row builders -------------------------------------------------------

  function isCurrentUser(member: TeamMemberRow) {
    return typeof currentUserId === 'number' && member.numericUserId === currentUserId;
  }

  function MemberRow({
    member,
    nested = false,
    sideMeta,
    warning = false,
    primaryAction,
  }: {
    member: TeamMemberRow;
    nested?: boolean;
    sideMeta?: ReactNode;
    warning?: boolean;
    primaryAction?: ReactNode;
  }) {
    const ringColor = member.role === 'dentist'
      ? member.calendarColor || 'var(--color-accent)'
      : null;
    const style = ringColor ? ({ '--row-accent': ringColor } as CSSProperties) : undefined;
    const overflowDisabled = !isEditMode || member.role === 'owner' || savingMemberId === member.userId;
    const showYouTag = isCurrentUser(member);
    const isPending = member.status === 'pending';

    return (
      <div
        className={[
          styles.row,
          nested ? styles.rowNested : '',
          warning ? styles.rowWarning : '',
          isPending ? styles.rowPending : '',
          member.role === 'dentist' ? styles.rowDentist : '',
        ].filter(Boolean).join(' ')}
        style={style}
      >
        <div className={styles.rowName}>
          <span className={styles.rowNameText}>{displayName(member)}</span>
          {showYouTag && <span className={styles.tagYou}>tu</span>}
          {isPending && <span className={styles.tagPending}>invitat</span>}
        </div>
        {sideMeta && <span className={styles.rowMeta}>{sideMeta}</span>}
        <div className={styles.rowActions}>
          {primaryAction}
          {!overflowDisabled && (
            <EditPopover
              member={member}
              dentists={dentists}
              onSave={updateMember}
              onRemove={setRemoveTarget}
              trigger={({ ref, isOpen, ...rest }: any) => (
                <button
                  ref={ref}
                  {...rest}
                  type="button"
                  className={`${styles.overflowButton} ${isOpen ? styles.overflowOpen : ''}`}
                  aria-label={`Acțiuni pentru ${displayName(member)}`}
                  aria-expanded={isOpen}
                  disabled={savingMemberId === member.userId}
                >
                  <IconMore />
                </button>
              )}
            />
          )}
        </div>
      </div>
    );
  }

  function NestedAssistantList({ dentistId }: { dentistId: number }) {
    const list = asistentsForDentist(dentistId);
    if (list.length === 0) return null;
    return (
      <div className={styles.branch}>
        {list.map((asistent) => {
          const others = otherDentistNames(asistent, dentistId);
          const meta = others.length > 0 ? `și pentru ${others.join(', ')}` : null;
          return (
            <MemberRow key={asistent.userId} member={asistent} nested sideMeta={meta} />
          );
        })}
      </div>
    );
  }

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <SettingsMobileHeader title="Echipa" />
        <RoleMigrationBanner />
        <div className={styles.tabRow}>
          <SettingsTabs activeTab="team" isOwner={isOwner} />
        </div>

        <div className={styles.surface}>
          <header className={styles.surfaceHeader}>
            <h1 className={styles.surfaceTitle}>Echipa clinicii</h1>
            <div className={styles.surfaceMeta}>
              {seats && (
                <div className={styles.seatHero}>
                  <span className={styles.seatLabel}>
                    <strong>{seats.used}</strong> / {seats.max} locuri
                  </span>
                  {showSeatTrack && (
                    <span className={styles.seatTrack} aria-hidden="true">
                      <span style={{ width: `${seatRatio * 100}%` }} />
                    </span>
                  )}
                </div>
              )}
              {isEditMode && <InviteSplitButton onInvite={openInvite} />}
            </div>
          </header>

          {isEditMode && showInviteForm && (
            <div className={styles.inviteCard} ref={inviteFormRef}>
              <div className={styles.inviteHeader}>
                <strong>Invitatie noua &middot; {ROLE_LABEL[inviteRole]}</strong>
                <button
                  type="button"
                  className={styles.inviteClose}
                  onClick={() => setShowInviteForm(false)}
                  disabled={inviting}
                  aria-label="Închide formularul"
                >
                  <IconClose />
                </button>
              </div>
              <div className={styles.inviteGrid}>
                <label className={styles.field}>
                  <span>Nume</span>
                  <input value={inviteName} onChange={(event) => setInviteName(event.target.value)} disabled={inviting} />
                </label>
                <label className={styles.field}>
                  <span>Email</span>
                  <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} disabled={inviting} />
                </label>
                <label className={styles.field}>
                  <span>Rol</span>
                  <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} disabled={inviting}>
                    {EDITABLE_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABEL[role]}</option>)}
                  </select>
                </label>
                {inviteRole === 'asistent' && (
                  <label className={styles.field}>
                    <span>Lucreaza cu</span>
                    <select
                      multiple
                      size={Math.min(4, Math.max(2, dentists.length))}
                      value={inviteAssignments.map(String)}
                      onChange={(event) => {
                        setInviteAssignments(Array.from(event.currentTarget.selectedOptions).map((option) => Number(option.value)));
                      }}
                      disabled={inviting}
                    >
                      {dentists.map((dentist) => (
                        <option key={dentist.userId} value={dentist.numericUserId ?? ''}>{displayName(dentist)}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {inviteError && <p className={styles.inviteError}>{inviteError}</p>}
              <div className={styles.inviteActions}>
                <button type="button" className={styles.popoverSecondary} onClick={() => setShowInviteForm(false)} disabled={inviting}>
                  Anulează
                </button>
                <button type="button" className={styles.popoverPrimary} onClick={handleInvite} disabled={inviting}>
                  {inviting ? 'Se trimite...' : 'Trimite'}
                </button>
              </div>
            </div>
          )}

          <div className={styles.list}>
            {/* Owner cluster — owner row, plus any assistants who serve owner */}
            {grouped.owners.map((owner) => (
              <div key={owner.userId} className={styles.cluster}>
                <MemberRow member={owner} />
                {typeof owner.numericUserId === 'number' && (
                  <NestedAssistantList dentistId={owner.numericUserId} />
                )}
              </div>
            ))}

            {/* Each dentist with their assistants nested */}
            {grouped.dentistRows.map((dentist) => (
              <div key={dentist.userId} className={styles.cluster}>
                <MemberRow member={dentist} />
                {typeof dentist.numericUserId === 'number' && (
                  <NestedAssistantList dentistId={dentist.numericUserId} />
                )}
              </div>
            ))}

            {/* Receptionists — flat cluster */}
            {grouped.receptionists.length > 0 && (
              <div className={styles.cluster}>
                {grouped.receptionists.map((member) => (
                  <MemberRow key={member.userId} member={member} sideMeta="receptioner" />
                ))}
              </div>
            )}

            {/* Orphan asistents — warning cluster */}
            {grouped.orphanAsistents.length > 0 && (
              <div className={`${styles.cluster} ${styles.clusterWarning}`}>
                <div className={styles.warningHeader}>
                  <IconAlert />
                  <span>Asistenti fără dentist asignat</span>
                </div>
                {grouped.orphanAsistents.map((member) => (
                  <MemberRow
                    key={member.userId}
                    member={member}
                    warning
                    primaryAction={isEditMode ? (
                      <EditPopover
                        member={member}
                        dentists={dentists}
                        onSave={updateMember}
                        onRemove={setRemoveTarget}
                        trigger={({ ref, isOpen, ...rest }: any) => (
                          <button
                            ref={ref}
                            {...rest}
                            type="button"
                            className={styles.assignButton}
                            aria-expanded={isOpen}
                          >
                            <span>Asigneaza</span>
                            <IconArrowRight />
                          </button>
                        )}
                      />
                    ) : (
                      <span className={styles.rowMeta}>asteapta asignare</span>
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          {isEditMode && onlyOwner && (
            <div className={styles.emptyState}>
              <p>Echipa ta este momentan doar proprietarul.</p>
              <div className={styles.emptyActions}>
                <button type="button" className={styles.popoverPrimary} onClick={() => openInvite('dentist')}>
                  Invita dentist
                </button>
                <button type="button" className={styles.popoverSecondary} onClick={() => openInvite('receptionist')}>
                  Invita receptioner
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={removeTarget !== null}
        title="Elimina din clinica"
        message={`Această acțiune scoate complet accesul lui ${removeTarget ? displayName(removeTarget) : ''} din clinică. Pentru o simplă reasignare, editează asignarea dentiștilor.`}
        confirmLabel="Elimina din clinica"
        tone="danger"
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (removeTarget) await handleRemoveMember(removeTarget);
          setRemoveTarget(null);
        }}
      />

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
