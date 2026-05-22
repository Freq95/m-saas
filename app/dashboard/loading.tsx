import styles from './page.module.css';

// Rendered by Next.js during the server-side data fetch for /dashboard.
// Kills the post-login black screen on mobile by showing the page shell
// immediately instead of waiting for getAuthUser + dashboard queries to finish.
export default function Loading() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className="skeleton skeleton-line" style={{ width: '180px', height: '24px', marginBottom: '1.5rem' }} />

        <div className={styles.statsGrid}>
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="skeleton skeleton-stat" />
          ))}
        </div>

        <div className={styles.charts}>
          <div className="skeleton skeleton-chart" />
          <div className="skeleton skeleton-chart" />
        </div>

        <div className={styles.clientGrid}>
          <div className="skeleton skeleton-card" style={{ height: '260px' }} />
          <div className="skeleton skeleton-card" style={{ height: '260px' }} />
          <div className="skeleton skeleton-card" style={{ height: '260px' }} />
        </div>
      </main>
    </div>
  );
}
