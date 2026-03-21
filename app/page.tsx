'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const seen = sessionStorage.getItem('densa_intro_seen');
    if (!seen && heroRef.current) {
      heroRef.current.classList.add(styles.animate);
      setTimeout(() => sessionStorage.setItem('densa_intro_seen', '1'), 1200);
    }
  }, []);

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div ref={heroRef} className={styles.hero}>
          <h1 className={styles.wordmark}>densa</h1>
          <p className={styles.tagline}>Gestionare centralizata pentru mesaje, programari si automatizari</p>
          <div className={styles.actions}>
            <Link href="/dashboard" className={styles.primaryButton} prefetch>
              Acceseaza Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}