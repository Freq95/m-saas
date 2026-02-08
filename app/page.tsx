import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.container}>
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
