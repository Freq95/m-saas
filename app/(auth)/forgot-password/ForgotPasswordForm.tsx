'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import styles from '../auth.module.css';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Ai depasit limita de 7 cereri pe ora. Incearca din nou mai tarziu.');
        }
        throw new Error('Request failed');
      }

      setMessage('Daca adresa exista, vei primi un email cu instructiuni.');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Nu am putut trimite cererea. Incearca din nou.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.card} aria-labelledby="auth-forgot-title">
      <header className={styles.header}>
        <h1 id="auth-forgot-title" className={styles.title}>Recupereaza parola</h1>
        <p className={styles.subtitle}>Introdu adresa de email folosita la autentificare.</p>
      </header>

      {message && (
        <p className={`${styles.message} ${styles.messageSuccess}`} role="status">{message}</p>
      )}
      {error && (
        <p className={`${styles.message} ${styles.messageError}`} role="alert">{error}</p>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="auth-forgot-email" className={styles.label}>Email</label>
          <input
            id="auth-forgot-email"
            type="email"
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@clinica.ro"
            autoComplete="email"
            required
          />
        </div>

        <button type="submit" className={styles.primaryButton} disabled={submitting}>
          {submitting ? 'Se trimite...' : 'Trimite linkul de resetare'}
        </button>
      </form>

      <Link href="/login" className={styles.backLink}>Inapoi la autentificare</Link>
    </section>
  );
}
