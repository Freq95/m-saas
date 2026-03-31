'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

const LEGAL_PATHS = ['/privacy', '/terms'];

export default function AuthLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (LEGAL_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <h1 style={{ marginBottom: 16 }}>densa</h1>
        {children}
      </div>
    </div>
  );
}
