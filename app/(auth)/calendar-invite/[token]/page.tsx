'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';

type InvitePreview = {
  email: string;
  calendarId: number;
  calendarName: string;
  calendarColor: string;
  sharedByName: string | null;
  existingUser: boolean;
  isLoggedIn: boolean;
  emailMatchesSession: boolean;
};

export default function CalendarInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { status } = useSession();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const loginRedirect = useMemo(
    () => `/login?redirect=${encodeURIComponent(`/calendar-invite/${token}`)}`,
    [token]
  );

  useEffect(() => {
    async function loadInvite() {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/calendar-shares/accept?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) {
        setInvite(null);
        setError(data.error || 'Invitatia nu a putut fi incarcata.');
        setLoading(false);
        return;
      }
      setInvite(data.invite);
      setLoading(false);
    }

    loadInvite();
  }, [token, status]);

  async function acceptInvite(payload: Record<string, unknown>) {
    setSubmitting(true);
    setError(null);
    const response = await fetch('/api/calendar-shares/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setSubmitting(false);
      setError(data.error || 'Invitatia nu a putut fi procesata.');
      return null;
    }
    return data;
  }

  async function handleAcceptLoggedIn() {
    const result = await acceptInvite({ token });
    if (!result) return;
    router.replace('/calendar');
  }

  async function handleDecline() {
    const result = await acceptInvite({ token, action: 'decline' });
    if (!result) return;
    router.replace('/login');
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    if (!invite) return;

    if (!name.trim()) {
      setError('Numele este obligatoriu.');
      return;
    }
    if (password.length < 8) {
      setError('Parola trebuie sa aiba minimum 8 caractere.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Parolele nu coincid.');
      return;
    }

    const result = await acceptInvite({
      token,
      name: name.trim(),
      password,
    });
    if (!result) return;

    const signInResult = await signIn('credentials', {
      email: invite.email,
      password,
      redirect: false,
    });
    if (!signInResult || signInResult.error) {
      setSubmitting(false);
      setError('Contul a fost creat, dar autentificarea automata a esuat. Te rugam sa te autentifici manual.');
      return;
    }

    router.replace('/calendar');
  }

  if (loading) {
    return <p>Se incarca invitatia...</p>;
  }

  if (!invite) {
    return <p style={{ color: 'var(--color-danger)' }}>{error || 'Invitatie invalida.'}</p>;
  }

  const noSession = status === 'unauthenticated';
  const loggedInWrongAccount = status === 'authenticated' && !invite.emailMatchesSession;
  const canRegister = noSession && !invite.existingUser;
  const mustLogin = noSession && invite.existingUser;
  const canAcceptLoggedIn = status === 'authenticated' && invite.emailMatchesSession;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <h2>Invitatie calendar</h2>
      <p>
        <strong>{invite.sharedByName || 'Un coleg'}</strong> ti-a partajat calendarul{' '}
        <strong>{invite.calendarName}</strong>.
      </p>
      <p style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          aria-hidden
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            background: invite.calendarColor || '#2563eb',
            display: 'inline-block',
          }}
        />
        <span>{invite.email}</span>
      </p>
      {error && <p style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {loggedInWrongAccount && (
        <div style={{ display: 'grid', gap: 10 }}>
          <p>Esti autentificat cu alt cont. Te rugam sa folosesti contul asociat cu {invite.email}.</p>
          <Link href={loginRedirect} style={{ color: 'var(--color-info)' }}>
            Mergi la autentificare
          </Link>
        </div>
      )}

      {canAcceptLoggedIn && (
        <div style={{ display: 'grid', gap: 10 }}>
          <button type="button" onClick={handleAcceptLoggedIn} disabled={submitting}>
            {submitting ? 'Se accepta...' : 'Accepta invitatia'}
          </button>
          <button type="button" onClick={handleDecline} disabled={submitting}>
            Refuza invitatia
          </button>
        </div>
      )}

      {mustLogin && (
        <div style={{ display: 'grid', gap: 10 }}>
          <p>Acest email are deja cont. Autentifica-te pentru a accepta invitatia.</p>
          <Link href={loginRedirect} style={{ color: 'var(--color-info)' }}>
            Mergi la autentificare
          </Link>
          <button type="button" onClick={handleDecline} disabled={submitting}>
            Refuza invitatia
          </button>
        </div>
      )}

      {canRegister && (
        <form onSubmit={handleRegister} style={{ display: 'grid', gap: 12 }}>
          <p>Creeaza-ti contul pentru a accepta invitatia.</p>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Nume</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
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
            {submitting ? 'Se creeaza contul...' : 'Creeaza cont si accepta'}
          </button>
          <button type="button" onClick={handleDecline} disabled={submitting}>
            Refuza invitatia
          </button>
        </form>
      )}
    </div>
  );
}
