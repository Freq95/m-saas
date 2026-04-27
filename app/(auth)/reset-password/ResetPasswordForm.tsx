'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../auth.module.css';

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [checking, setChecking] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function validateToken() {
      if (!token) {
        setChecking(false);
        setValidToken(false);
        setError('Link invalid sau expirat.');
        return;
      }

      try {
        const response = await fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        const result = await response.json();
        if (cancelled) return;

        setValidToken(Boolean(result.valid));
        setError(result.valid ? null : 'Link invalid sau expirat.');
      } catch {
        if (cancelled) return;
        setValidToken(false);
        setError('Nu am putut valida linkul de resetare.');
      } finally {
        if (!cancelled) {
          setChecking(false);
        }
      }
    }

    void validateToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!validToken) return;
    if (password.length < 8) {
      setError('Parola trebuie sa aiba cel putin 8 caractere.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Parolele nu coincid.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Reset failed');
      }
      router.replace('/login?success=password-reset');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nu am putut reseta parola.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="auth-reset-title">
      <header className={styles.header}>
        <h1 id="auth-reset-title" className={styles.title}>Seteaza parola noua</h1>
        <p className={styles.subtitle}>Alege o parola pe care o poti tine minte si care are minimum 8 caractere.</p>
      </header>

      {checking && <p className={styles.loadingText}>Se valideaza linkul...</p>}
      {error && (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p>
      )}

      {!checking && validToken && (
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="auth-new-password" className={styles.label}>Parola noua</label>
            <input
              id="auth-new-password"
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
            <label htmlFor="auth-confirm-password" className={styles.label}>Confirma parola</label>
            <input
              id="auth-confirm-password"
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
            {submitting ? 'Se actualizeaza...' : 'Reseteaza parola'}
          </button>
        </form>
      )}

      <Link href="/login" className={styles.backLink}>Inapoi la autentificare</Link>
    </section>
  );
}
