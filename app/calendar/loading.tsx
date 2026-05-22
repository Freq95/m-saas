import styles from './page.module.css';

// Rendered by Next.js during the server-side data fetch for /calendar.
// Replaces the post-login black screen on mobile with a placeholder grid
// while getAuthUser + calendar list + appointments are still resolving.
export default function Loading() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="skeleton skeleton-line" style={{ width: '220px', height: '28px' }} />
          <div className="skeleton skeleton-line" style={{ width: '140px', height: '36px', borderRadius: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {Array.from({ length: 7 }).map((_, idx) => (
            <div key={idx} className="skeleton skeleton-line" style={{ height: '40px' }} />
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          <div className="skeleton" style={{ width: '100%', height: '100%', minHeight: 420, borderRadius: 12 }} />
        </div>
      </main>
    </div>
  );
}
