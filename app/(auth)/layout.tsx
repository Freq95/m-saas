'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import styles from './auth.module.css';

const LEGAL_PATHS = ['/privacy', '/terms'];

export default function AuthLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (LEGAL_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className={styles.page}>
      <Link href="/login" className={styles.brand} aria-label="densa — mergi la autentificare">
        densa
      </Link>
      {children}
    </div>
  );
}
