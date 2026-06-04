'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Spinner from '@/components/Spinner';
import styles from './page.module.css';

export default function LaunchPageClient() {
  const router = useRouter();

  useEffect(() => {
    window.__densaPerf?.mark('densa:launch-visible');
    router.prefetch('/calendar');
    window.__densaPerf?.mark('densa:launch-prefetch-calendar', { href: '/calendar' });
    const frame = requestAnimationFrame(() => {
      window.__densaPerf?.mark('densa:launch-redirect', { href: '/calendar' });
      window.dispatchEvent(new CustomEvent('densa:navigation-start', { detail: { href: '/calendar' } }));
      router.replace('/calendar');
    });
    return () => cancelAnimationFrame(frame);
  }, [router]);

  return (
    <main className={styles.launch} aria-label="densa">
      <div className={styles.brand}>
        <div className={styles.wordmark}>densa</div>
        <Spinner size={30} thickness={2.5} centered={false} />
      </div>
    </main>
  );
}
