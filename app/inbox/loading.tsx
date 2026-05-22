import styles from './page.module.css';

// Rendered by Next.js while /inbox does its server work
// (conversations + message stats + attachments + read state + previews).
// Without this file, clicking the Inbox nav icon highlights it instantly but
// the OLD page stays visible until the server finishes — looks like a broken click.
export default function Loading() {
  return (
    <div className={styles.container}>
      <div className={styles.inbox}>
        {/* Left rail: conversation list skeleton */}
        <div className={styles.conversationList} style={{ width: 320, padding: '0.75rem' }}>
          <div className="skeleton skeleton-line" style={{ width: '70%', height: 18, marginBottom: '0.85rem' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="skeleton" style={{ height: 64, borderRadius: 10 }} />
            ))}
          </div>
        </div>

        {/* Right pane: empty conversation placeholder */}
        <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: 0 }}>
          <div className="skeleton skeleton-line" style={{ width: '40%', height: 22 }} />
          <div className="skeleton skeleton-line" style={{ width: '25%', height: 14 }} />
          <div className="skeleton" style={{ flex: 1, minHeight: 320, borderRadius: 12, marginTop: '0.5rem' }} />
        </div>
      </div>
    </div>
  );
}
