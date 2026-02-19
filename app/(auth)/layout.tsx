import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <h1 style={{ marginBottom: 16 }}>OpsGenie</h1>
        {children}
      </div>
    </div>
  );
}
