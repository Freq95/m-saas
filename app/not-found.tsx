'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'var(--gradient-app)',
        color: 'var(--color-text)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          border: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          borderRadius: '16px',
          padding: '36px 28px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '72px', fontWeight: 800, lineHeight: 1, color: 'var(--color-accent)' }}>404</div>
        <h1 style={{ marginTop: '12px', marginBottom: '8px', fontSize: '28px' }}>Pagina nu a fost gasita</h1>
        <p style={{ margin: 0, color: 'var(--color-text-soft)' }}>
          Pagina pe care o cauti nu exista sau a fost mutata.
        </p>
        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              minWidth: '140px',
              height: '40px',
              borderRadius: '10px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            Inapoi
          </button>
          <Link
            href="/dashboard"
            style={{
              minWidth: '140px',
              height: '40px',
              borderRadius: '10px',
              border: '1px solid var(--color-accent)',
              background: 'var(--color-accent)',
              color: '#fff',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
            }}
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
