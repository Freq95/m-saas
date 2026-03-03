'use client';

import Link from 'next/link';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
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
          padding: '32px 28px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: '8px', fontSize: '30px' }}>A aparut o eroare</h1>
        <p style={{ margin: 0, color: 'var(--color-text-soft)' }}>
          Ceva nu a mers bine. Incearca din nou.
        </p>
        <p style={{ marginTop: '10px', marginBottom: 0, color: 'var(--color-text-soft)', fontSize: '13px' }}>
          {error.message}
        </p>
        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              minWidth: '160px',
              height: '40px',
              borderRadius: '10px',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            Incearca din nou
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
