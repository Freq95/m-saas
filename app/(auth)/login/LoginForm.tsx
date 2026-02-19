'use client';

import { FormEvent, useState } from 'react';
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
      setError('Invalid credentials.');
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
      <button type="submit" disabled={submitting}>
        {submitting ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
