'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

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
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
      <h2>Seteaza parola noua</h2>
      {checking ? <p>Se valideaza linkul...</p> : null}
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      {!checking && validToken ? (
        <>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Parola noua</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>Confirma parola</span>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </label>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Se actualizeaza...' : 'Reseteaza parola'}
          </button>
        </>
      ) : null}
      <Link href="/login" style={{ color: '#93c5fd', fontSize: 14 }}>
        Inapoi la login
      </Link>
    </form>
  );
}
