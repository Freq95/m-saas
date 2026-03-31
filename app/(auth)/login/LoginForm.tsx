'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

type LoginFormProps = {
  successMessage?: string;
};

export default function LoginForm({ successMessage }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function getLoginErrorMessage(result: Awaited<ReturnType<typeof signIn>>): string {
    if (result?.code === 'database_connection_failed') {
      return 'Database connection failed. Try again in a moment.';
    }
    if (result?.error === 'CallbackRouteError') {
      return 'Authentication service failed. Try again in a moment.';
    }
    return 'Invalid credentials.';
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

    const sessionRes = await fetch('/api/auth/session');
    const session = await sessionRes.json();
    if (session?.user?.role === 'super_admin') {
      router.replace('/admin');
      return;
    }
    router.replace('/dashboard');
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
      <h2>Login</h2>
      {successMessage && <p style={{ color: '#22c55e' }}>{successMessage}</p>}
      {error && <p style={{ color: '#f87171' }}>{error}</p>}
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <Link href="/forgot-password" style={{ color: '#93c5fd', fontSize: 14 }}>
        Ai uitat parola?
      </Link>
      <button type="submit" disabled={submitting}>
        {submitting ? 'Signing in...' : 'Sign in'}
      </button>
      <div style={{ textAlign: 'center', marginTop: '2rem', fontSize: '0.8rem', color: '#9ca3af' }}>
        <Link href="/privacy" style={{ color: '#6b7280', marginRight: '1rem' }}>Politica de confidentialitate</Link>
        <Link href="/terms" style={{ color: '#6b7280' }}>Termeni si conditii</Link>
      </div>
    </form>
  );
}
