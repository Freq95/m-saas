'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useParams, useRouter } from 'next/navigation';
import styles from '../../auth.module.css';

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
        setError(data.error || 'Invitația nu a putut fi încărcată.');
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
      setError(data.error || 'Invitația nu a putut fi procesata.');
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
      setError('Parola trebuie să aiba minimum 8 caractere.');
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
      setError('Contul a fost creat, dar autentificarea automata a eșuat. Te rugăm să te autentifici manual.');
      return;
    }

    router.replace('/calendar');
  }

  if (loading) {
    return (
      <section className={styles.card}>
        <p className={styles.loadingText}>Se încarcă invitația...</p>
      </section>
    );
  }

  if (!invite) {
    return (
      <section className={styles.card}>
        <p className={`${styles.message} ${styles.messageError}`} role="alert">
          {error || 'Invitatie invalida.'}
        </p>
        <Link href="/login" className={styles.backLink}>Inapoi la autentificare</Link>
      </section>
    );
  }

  const noSession = status === 'unauthenticated';
  const loggedInWrongAccount = status === 'authenticated' && !invite.emailMatchesSession;
  const canRegister = noSession && !invite.existingUser;
  const mustLogin = noSession && invite.existingUser;
  const canAcceptLoggedIn = status === 'authenticated' && invite.emailMatchesSession;

  return (
    <section className={styles.card} aria-labelledby="auth-cal-invite-title">
      <header className={styles.header}>
        <h1 id="auth-cal-invite-title" className={styles.title}>Invitatie calendar</h1>
        <p className={styles.subtitle}>
          <strong style={{ color: 'var(--color-text)' }}>{invite.sharedByName || 'Un coleg'}</strong>{' '}
          ti-a partajat calendarul{' '}
          <strong style={{ color: 'var(--color-text)' }}>{invite.calendarName}</strong>.
        </p>
      </header>

      <div className={styles.inviteSummary}>
        <span
          aria-hidden="true"
          className={styles.inviteDot}
          style={{ background: invite.calendarColor || 'var(--color-accent)' }}
        />
        <span>{invite.email}</span>
      </div>

      {error && (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p>
      )}

      {loggedInWrongAccount && (
        <div className={styles.buttonRow}>
          <p className={styles.inviteMeta}>
            Ești autentificat cu alt cont. Te rugăm să folosești contul asociat cu {invite.email}.
          </p>
          <Link href={loginRedirect} className={styles.primaryButton} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            Mergi la autentificare
          </Link>
        </div>
      )}

      {canAcceptLoggedIn && (
        <div className={styles.buttonRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleAcceptLoggedIn}
            disabled={submitting}
          >
            {submitting ? 'Se acceptă...' : 'Acceptă invitația'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleDecline}
            disabled={submitting}
          >
            Refuză invitația
          </button>
        </div>
      )}

      {mustLogin && (
        <div className={styles.buttonRow}>
          <p className={styles.inviteMeta}>
            Acest email are deja cont. Autentifica-te pentru a acceptă invitația.
          </p>
          <Link href={loginRedirect} className={styles.primaryButton} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
            Mergi la autentificare
          </Link>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleDecline}
            disabled={submitting}
          >
            Refuză invitația
          </button>
        </div>
      )}

      {canRegister && (
        <form onSubmit={handleRegister} className={styles.form}>
          <p className={styles.inviteMeta}>Creeaza-ți contul pentru a acceptă invitația.</p>

          <div className={styles.field}>
            <label htmlFor="cal-invite-name" className={styles.label}>Nume</label>
            <input
              id="cal-invite-name"
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Numele tau"
              autoComplete="name"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="cal-invite-password" className={styles.label}>Parola</label>
            <input
              id="cal-invite-password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minim 8 caractere"
              autoComplete="new-password"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="cal-invite-confirm" className={styles.label}>Confirma parola</label>
            <input
              id="cal-invite-confirm"
              type="password"
              className={styles.input}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Reintrodu parola"
              autoComplete="new-password"
              required
            />
          </div>

          <button type="submit" className={styles.primaryButton} disabled={submitting}>
            {submitting ? 'Se creeaza contul...' : 'Creeaza cont și acceptă'}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleDecline}
            disabled={submitting}
          >
            Refuză invitația
          </button>
        </form>
      )}
    </section>
  );
}
