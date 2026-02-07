import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.container}>
      <nav className={styles.nav}>
        <h1 className={styles.logo}>OpsGenie</h1>
        <div className={styles.navLinks}>
          <Link href="/dashboard" prefetch>Dashboard</Link>
          <Link href="/inbox" prefetch>Inbox</Link>
          <Link href="/calendar" prefetch>Calendar</Link>
          <Link href="/clients" prefetch>Clients</Link>
          <Link href="/settings/email" prefetch>Settings</Link>
        </div>
      </nav>
      <main className={styles.main}>
        <div className={styles.hero}>
          <h2>Bun venit la OpsGenie pentru Micro-Servicii</h2>
          <p>Gestionare centralizata pentru mesaje, programari si automatizari</p>
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
