'use client';

import { useState } from 'react';
import { ToastContainer } from '@/components/Toast';
import { useToast } from '@/lib/useToast';
import { ConfirmModal } from '@/app/calendar/components/modals/ConfirmModal';
import navStyles from '../../dashboard/page.module.css';
import styles from './page.module.css';
import SettingsTabs from '../SettingsTabs';
import type { TeamData, TeamMemberRow } from '@/lib/server/team';

interface TeamSettingsPageClientProps {
  initialTeamData: TeamData | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Invitat',
  active: 'Activ',
  removed: 'Eliminat',
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'Administrator',
  staff: 'Personal',
};

export default function TeamSettingsPageClient({ initialTeamData }: TeamSettingsPageClientProps) {
  const [teamData, setTeamData] = useState<TeamData | null>(initialTeamData);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TeamMemberRow | null>(null);
  const toast = useToast();

  async function refreshTeam() {
    try {
      const res = await fetch('/api/team');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.members) {
        setTeamData({
          members: data.members.map((m: any) => ({
            userId: String(m.user_id),
            email: m.user_email || m.email || '',
            name: m.name || null,
            role: m.role || 'staff',
            status: m.status || 'pending',
            invitedAt: m.invited_at || '',
            acceptedAt: m.accepted_at || null,
          })),
          seats: {
            used: data.seats?.used ?? 0,
            max: data.seats?.max ?? 0,
          },
        });
      }
    } catch {
      // silent — user still sees previous state
    }
  }

  async function handleInvite() {
    const email = inviteEmail.trim();
    const name = inviteName.trim();
    if (!email) {
      setInviteError('Emailul este obligatoriu.');
      return;
    }
    if (!name) {
      setInviteError('Numele este obligatoriu.');
      return;
    }
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Nu am putut trimite invitatia.');
      }
      toast.success('Invitatia a fost trimisa.');
      setShowInviteForm(false);
      setInviteEmail('');
      setInviteName('');
      await refreshTeam();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Nu am putut trimite invitatia.';
      setInviteError(msg);
      toast.error(msg);
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(member: TeamMemberRow) {
    const res = await fetch(`/api/team/${member.userId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || 'Nu am putut elimina membrul.');
    }
    toast.success(`${member.name || member.email} a fost eliminat din echipa.`);
    await refreshTeam();
  }

  const activeMembers = teamData?.members.filter((m) => m.status !== 'removed') ?? [];
  const seats = teamData?.seats;

  return (
    <div className={navStyles.container}>
      <div className={styles.container}>
        <div className={styles.tabRow}>
          <SettingsTabs activeTab="team" />
          {!showInviteForm && (
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => { setShowInviteForm(true); setInviteError(null); }}
            >
              + Invita
            </button>
          )}
        </div>

        {seats && (
          <p className={styles.seatsLabel}>
            {seats.used} / {seats.max} locuri folosite
          </p>
        )}

        {showInviteForm && (
          <div className={styles.formCard}>
            <h3 className={styles.formTitle}>Invita un nou membru</h3>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Nume *</span>
                <input
                  type="text"
                  maxLength={100}
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  disabled={inviting}
                  placeholder="Dr. Popescu Ion"
                />
              </label>
              <label className={styles.field}>
                <span>Email *</span>
                <input
                  type="email"
                  maxLength={255}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  disabled={inviting}
                  placeholder="doctor@clinica.ro"
                />
              </label>
            </div>
            {inviteError && <p className={styles.error}>{inviteError}</p>}
            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => { setShowInviteForm(false); setInviteError(null); setInviteEmail(''); setInviteName(''); }}
                disabled={inviting}
              >
                Anuleaza
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleInvite}
                disabled={inviting}
              >
                {inviting ? 'Se trimite...' : 'Trimite invitatia'}
              </button>
            </div>
          </div>
        )}

        {activeMembers.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Niciun membru in echipa inca.</p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => { setShowInviteForm(true); setInviteError(null); }}
            >
              + Invita primul membru
            </button>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nume</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Status</th>
                  <th aria-label="Actiuni" />
                </tr>
              </thead>
              <tbody>
                {activeMembers.map((member) => (
                  <tr key={member.userId} className={styles.row}>
                    <td>{member.name || '—'}</td>
                    <td>{member.email}</td>
                    <td>{ROLE_LABEL[member.role] || member.role}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[`status_${member.status}`] || ''}`}>
                        {STATUS_LABEL[member.status] || member.status}
                      </span>
                    </td>
                    <td>
                      {member.role !== 'owner' && (
                        <div className={styles.actionGroup}>
                          <button
                            type="button"
                            className={styles.iconButton}
                            onClick={() => setRemoveTarget(member)}
                            aria-label={`Elimina ${member.name || member.email}`}
                            title="Elimina"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6l-1 14H6L5 6"/>
                              <path d="M10 11v6"/>
                              <path d="M14 11v6"/>
                              <path d="M9 6V4h6v2"/>
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={removeTarget !== null}
        title="Elimina membrul"
        message={`Elimini accesul lui ${removeTarget?.name || removeTarget?.email} din clinica? Actiunea nu poate fi anulata.`}
        confirmLabel="Elimina"
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
