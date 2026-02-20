'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type TenantDetailClientProps = {
  tenant: any;
  owner: any;
  members: any[];
  seatUsage: number;
};

export default function TenantDetailClient({ tenant, owner, members, seatUsage }: TenantDetailClientProps) {
  const router = useRouter();
  const [plan, setPlan] = useState(tenant.plan || 'free');
  const [status, setStatus] = useState(tenant.status || 'active');
  const [maxSeats, setMaxSeats] = useState(Number(tenant.max_seats || 1));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const isDeleted = tenant.status === 'deleted' || Boolean(tenant.deleted_at);

  const atLimit = seatUsage >= maxSeats;
  const seatWarning = useMemo(() => {
    if (maxSeats < seatUsage) {
      return `There are currently ${seatUsage} active members. No new invites will be allowed until members are removed.`;
    }
    if (atLimit) {
      return 'Seat limit reached.';
    }
    return null;
  }, [atLimit, maxSeats, seatUsage]);

  async function saveTenantChanges(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const statusChanged = status !== (tenant.status || 'active');
    let reason: string | undefined;
    if (statusChanged) {
      const input = window.prompt('Provide reason for tenant status transition:');
      if (!input || input.trim().length < 3) {
        setError('Reason is required for status transitions.');
        return;
      }
      reason = input.trim();
    }
    setWorking(true);
    const response = await fetch(`/api/admin/tenants/${tenant._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, status, maxSeats, reason }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to update tenant');
      setWorking(false);
      return;
    }
    router.refresh();
    setWorking(false);
  }

  async function softDeleteTenant() {
    const confirmed = window.confirm('Soft delete this tenant? This will disable all tenant users and memberships.');
    if (!confirmed) return;
    const reason = window.prompt('Reason for soft delete:');
    if (!reason || reason.trim().length < 3) {
      setError('Reason is required for soft delete.');
      return;
    }
    setError(null);
    setWorking(true);
    const response = await fetch(`/api/admin/tenants/${tenant._id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to suspend tenant');
      setWorking(false);
      return;
    }
    router.refresh();
    setWorking(false);
  }

  async function restoreTenant() {
    const confirmed = window.confirm('Restore this tenant and re-enable tenant users/memberships?');
    if (!confirmed) return;
    const reason = window.prompt('Reason for restore:');
    if (!reason || reason.trim().length < 3) {
      setError('Reason is required for restore.');
      return;
    }
    setError(null);
    setWorking(true);
    const response = await fetch(`/api/admin/tenants/${tenant._id}/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to restore tenant');
      setWorking(false);
      return;
    }
    router.refresh();
    setWorking(false);
  }

  async function resendInvite(userId: string) {
    setError(null);
    setNotice(null);
    setWorking(true);
    const response = await fetch(`/api/admin/tenants/${tenant._id}/resend-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to resend invite');
      setWorking(false);
      return;
    }
    if (data?.inviteEmail?.requested && !data?.inviteEmail?.sent) {
      setNotice('Invite token regenerated, but email was not sent because email service is not configured.');
    } else {
      setNotice('Invite resent successfully.');
    }
    router.refresh();
    setWorking(false);
  }

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setWorking(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/admin/tenants/${tenant._id}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: String(form.get('email') || ''),
        name: String(form.get('name') || ''),
        role: String(form.get('role') || 'staff'),
        sendInvite: true,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to add user');
      setWorking(false);
      return;
    }
    if (data?.inviteEmail?.requested && !data?.inviteEmail?.sent) {
      setNotice('User created, but invite email was not sent because email service is not configured.');
    } else {
      setNotice('User created and invite email sent.');
    }
    event.currentTarget.reset();
    router.refresh();
    setWorking(false);
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>{tenant.name}</h1>
      <div style={{ border: '1px solid #334155', padding: 12 }}>
        <p>Status: {tenant.status}</p>
        {tenant.deleted_at && <p>Deleted at: {new Date(tenant.deleted_at).toLocaleString()}</p>}
        <p>Plan: {tenant.plan}</p>
        <p><strong>Seats: {seatUsage} / {maxSeats} used</strong></p>
        {seatWarning && <p style={{ color: '#facc15' }}>{seatWarning}</p>}
        <p>Owner: {owner?.name || '-'} ({owner?.email || '-'})</p>
      </div>

      <form onSubmit={saveTenantChanges} style={{ display: 'grid', gap: 8, maxWidth: 400 }}>
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        {notice && <p style={{ color: '#facc15' }}>{notice}</p>}
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Plan</span>
          <select value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="free">free</option>
            <option value="starter">starter</option>
            <option value="pro">pro</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
            <option value="deleted">deleted</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Max seats</span>
          <input
            type="number"
            min={1}
            value={maxSeats}
            onChange={(e) => setMaxSeats(Math.max(1, Number.parseInt(e.target.value || '1', 10)))}
          />
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={working}>Save changes</button>
          {!isDeleted && (
            <button type="button" onClick={softDeleteTenant} disabled={working}>Soft delete tenant</button>
          )}
          {isDeleted && (
            <button type="button" onClick={restoreTenant} disabled={working}>Restore tenant</button>
          )}
        </div>
      </form>

      <section>
        <h2>Members</h2>
        <ul>
          {members.map((member: any) => (
            <li key={String(member._id)}>
              {member.name || '-'} ({member.email || '-'}) - {member.role} - {member.status}{' '}
              {member.status === 'pending_invite' && (
                <button type="button" onClick={() => resendInvite(String(member.user_id))} disabled={working}>
                  Resend invite
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Add user</h2>
        <form onSubmit={addUser} style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
          <input name="name" placeholder="Name" required />
          <input type="email" name="email" placeholder="Email" required />
          <input type="hidden" name="role" value="staff" />
          <span style={{ fontSize: 13, color: '#666' }}>Role: staff (only role available in MVP)</span>
          <button type="submit" disabled={working || atLimit}>Send invite</button>
        </form>
      </section>
    </div>
  );
}
