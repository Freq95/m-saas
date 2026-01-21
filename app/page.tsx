'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.container}>
      <nav className={styles.nav}>
        <h1 className={styles.logo}>OpsGenie</h1>
        <div className={styles.navLinks}>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/inbox">Inbox</Link>
          <Link href="/calendar">Calendar</Link>
        </div>
      </nav>
      <main className={styles.main}>
        <div className={styles.hero}>
          <h2>Bun venit la OpsGenie pentru Micro-Servicii</h2>
          <p>Gestionare centralizată pentru mesaje, programări și automatizări</p>
          <div className={styles.actions}>
            <Link href="/dashboard" className={styles.primaryButton}>
              Accesează Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

