'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type UserDetailClientProps = {
  user: any;
  tenant: any;
  memberships: any[];
};

export default function UserDetailClient({ user, tenant, memberships }: UserDetailClientProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name || '');
  const [role, setRole] = useState(user.role || 'viewer');
  const [status, setStatus] = useState(user.status || 'active');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const isDeleted = user.status === 'deleted' || Boolean(user.deleted_at);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setWorking(true);
    const response = await fetch(`/api/admin/users/${user._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, status }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to update user');
      setWorking(false);
      return;
    }
    router.refresh();
    setWorking(false);
  }

  async function softDelete() {
    setError(null);
    setWorking(true);
    const response = await fetch(`/api/admin/users/${user._id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to delete user');
      setWorking(false);
      return;
    }
    router.refresh();
    setWorking(false);
  }

  async function restore() {
    setError(null);
    setWorking(true);
    const response = await fetch(`/api/admin/users/${user._id}/restore`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to restore user');
      setWorking(false);
      return;
    }
    router.refresh();
    setWorking(false);
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h1>Manage User</h1>
      <div style={{ border: '1px solid #334155', padding: 12 }}>
        <p>Email: {user.email}</p>
        <p>Status: {user.status}</p>
        <p>Tenant: {tenant?.name || 'Platform (no tenant)'}</p>
        {user.deleted_at && <p>Deleted at: {new Date(user.deleted_at).toLocaleString()}</p>}
      </div>

      <form onSubmit={save} style={{ display: 'grid', gap: 8, maxWidth: 420 }}>
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="super_admin">super_admin</option>
            <option value="owner">owner</option>
            <option value="admin">admin</option>
            <option value="staff">staff</option>
            <option value="viewer">viewer</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">active</option>
            <option value="pending_invite">pending_invite</option>
            <option value="suspended">suspended</option>
            <option value="deleted">deleted</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="submit" disabled={working}>Save</button>
          {!isDeleted && (
            <button type="button" onClick={softDelete} disabled={working}>Soft delete</button>
          )}
          {isDeleted && (
            <button type="button" onClick={restore} disabled={working}>Restore</button>
          )}
        </div>
      </form>

      <section>
        <h2>Memberships</h2>
        {memberships.length === 0 && <p>No team memberships.</p>}
        {memberships.length > 0 && (
          <ul>
            {memberships.map((membership: any) => (
              <li key={String(membership._id)}>
                tenant: {String(membership.tenant_id)} | role: {membership.role} | status: {membership.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
