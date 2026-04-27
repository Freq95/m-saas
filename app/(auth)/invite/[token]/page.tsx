'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styles from '../../auth.module.css';

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

  if (loading) {
    return (
      <section className={styles.card}>
        <p className={styles.loadingText}>Se incarca invitatia...</p>
      </section>
    );
  }

  if (!invite) {
    return (
      <section className={styles.card}>
        <p className={`${styles.message} ${styles.messageError}`} role="alert">
          {error || 'Invitatie invalida.'}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="auth-invite-title">
      <header className={styles.header}>
        <h1 id="auth-invite-title" className={styles.title}>Seteaza parola</h1>
        <p className={styles.subtitle}>
          Te alaturi la <strong style={{ color: 'var(--color-text)' }}>{invite.tenantName}</strong>.
          Alege o parola si vei fi conectat imediat.
        </p>
      </header>

      {error && (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="invite-email" className={styles.label}>Email</label>
          <input
            id="invite-email"
            type="email"
            className={styles.input}
            value={invite.email}
            readOnly
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="invite-name" className={styles.label}>Nume</label>
          <input
            id="invite-name"
            type="text"
            className={styles.input}
            value={invite.name}
            readOnly
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="invite-password" className={styles.label}>Parola</label>
          <input
            id="invite-password"
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
          <label htmlFor="invite-confirm" className={styles.label}>Confirma parola</label>
          <input
            id="invite-confirm"
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
          {submitting ? 'Se salveaza...' : 'Seteaza parola'}
        </button>
      </form>
    </section>
  );
}
