'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { signIn, getSession } from 'next-auth/react';
import styles from '../auth.module.css';

type LoginFormProps = {
  successMessage?: string;
  redirectPath?: string;
  forcedLogout?: boolean;
};

function normalizeRedirectPath(value?: string): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) {
    return null;
  }
  return value;
}

export default function LoginForm({ successMessage, redirectPath, forcedLogout }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function getLoginErrorMessage(result: Awaited<ReturnType<typeof signIn>>): string {
    if (result?.code === 'database_connection_failed') {
      return 'Conexiunea cu baza de date a esuat. Incearca din nou in scurt timp.';
    }
    if (result?.error === 'CallbackRouteError') {
      return 'Serviciul de autentificare nu raspunde. Incearca din nou in scurt timp.';
    }
    return 'Email sau parola incorecte.';
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setSubmitting(false);
      setError(getLoginErrorMessage(result));
      return;
    }

    // Read role from the freshly minted JWT instead of a server round-trip to
    // /api/user/landing. getSession() decodes the cookie locally — no DB call.
    let roleLandingPath = '/dashboard';
    try {
      const session = await getSession();
      const role = session?.user?.role;
      if (role === 'dentist' || role === 'asistent') {
        roleLandingPath = '/calendar';
      }
    } catch {
      roleLandingPath = '/dashboard';
    }

    // Use a hard navigation so the fresh auth cookie is guaranteed to ship
    // with the next request. SPA navigation (router.replace) has shown
    // intermittent hangs in dev after a failed-then-successful login.
    const target = normalizeRedirectPath(redirectPath) || roleLandingPath;
    window.location.assign(target);
  }

  return (
    <section className={styles.card} aria-labelledby="auth-login-title">
      <header className={styles.header}>
        <h1 id="auth-login-title" className={styles.title}>Conecteaza-te</h1>
        <p className={styles.subtitle}>Acceseaza programarile, mesajele si datele clinicii tale.</p>
      </header>

      {forcedLogout && (
        <p className={`${styles.message} ${styles.messageInfo}`}>
          Sesiunea ta a fost inchisa automat. Te rog autentifica-te din nou.
        </p>
      )}
      {successMessage && (
        <p className={`${styles.message} ${styles.messageSuccess}`}>{successMessage}</p>
      )}
      {error && (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="auth-email" className={styles.label}>Email</label>
          <input
            id="auth-email"
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@clinica.ro"
            autoComplete="email"
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="auth-password" className={styles.label}>Parola</label>
          <input
            id="auth-password"
            type="password"
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Introdu parola"
            autoComplete="current-password"
            required
          />
        </div>

        <Link href="/forgot-password" className={styles.inlineLink}>
          Ai uitat parola?
        </Link>

        <button type="submit" className={styles.primaryButton} disabled={submitting}>
          {submitting ? 'Se autentifica...' : 'Conecteaza-te'}
        </button>
      </form>

      <div className={styles.footer}>
        <Link href="/privacy" className={styles.footerLink}>Politica de confidentialitate</Link>
        <Link href="/terms" className={styles.footerLink}>Termeni si conditii</Link>
      </div>
    </section>
  );
}
