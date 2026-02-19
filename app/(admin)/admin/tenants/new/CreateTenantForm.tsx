'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateTenantForm() {
  const router = useRouter();
  const [clinicName, setClinicName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [plan, setPlan] = useState<'free' | 'starter' | 'pro'>('free');
  const [maxSeats, setMaxSeats] = useState(1);
  const [sendInvite, setSendInvite] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const response = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinicName, ownerEmail, ownerName, plan, maxSeats, sendInvite }),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Failed to create tenant');
      setSubmitting(false);
      return;
    }

    router.replace(`/admin/tenants/${data.tenantId}`);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
      <h1>Create Tenant</h1>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Clinic name</span>
        <input value={clinicName} onChange={(e) => setClinicName(e.target.value)} required />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Owner email</span>
        <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Owner name</span>
        <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Plan</span>
        <select value={plan} onChange={(e) => setPlan(e.target.value as 'free' | 'starter' | 'pro')}>
          <option value="free">free</option>
          <option value="starter">starter</option>
          <option value="pro">pro</option>
        </select>
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Max seats</span>
        <input
          type="number"
          min={1}
          value={maxSeats}
          onChange={(e) => setMaxSeats(Math.max(1, Number.parseInt(e.target.value || '1', 10)))}
          required
        />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
        <span>Send invite email</span>
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating...' : 'Create tenant'}
      </button>
    </form>
  );
}
