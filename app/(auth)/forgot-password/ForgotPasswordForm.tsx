'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

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
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
      <h2>Recuperare parola</h2>
      <p style={{ color: '#94a3b8', margin: 0 }}>
        Introdu adresa de email folosita la autentificare.
      </p>
      {message && <p style={{ color: '#22c55e' }}>{message}</p>}
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? 'Se trimite...' : 'Trimite link de resetare'}
      </button>
      <Link href="/login" style={{ color: '#93c5fd', fontSize: 14 }}>
        Inapoi la login
      </Link>
    </form>
  );
}
