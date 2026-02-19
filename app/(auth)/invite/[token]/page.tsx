'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type InviteState = {
  email: string;
  name: string;
  tenantName: string;
  role: string;
};

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteState | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadInvite() {
      const response = await fetch(`/api/invite/${token}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        setError('Link-ul a expirat. Contacteaza administratorul.');
        setLoading(false);
        return;
      }
      setInvite(data);
      setLoading(false);
    }
    loadInvite();
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Parola trebuie sa aiba minimum 8 caractere.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Parolele nu coincid.');
      return;
    }
    setSubmitting(true);
    const response = await fetch(`/api/invite/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || 'Nu s-a putut seta parola.');
      setSubmitting(false);
      return;
    }
    router.replace('/login?success=password-set');
  }

  if (loading) return <p>Se incarca invitatia...</p>;
  if (!invite) return <p style={{ color: '#f87171' }}>{error || 'Invitatie invalida.'}</p>;

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
      <h2>Seteaza parola</h2>
      <p>Te alaturi la: <strong>{invite.tenantName}</strong></p>
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Email</span>
        <input type="email" value={invite.email} readOnly />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Nume</span>
        <input type="text" value={invite.name} readOnly />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Parola</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Confirma parola</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? 'Se salveaza...' : 'Seteaza parola'}
      </button>
    </form>
  );
}
