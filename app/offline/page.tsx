import Spinner from '@/components/Spinner';
import styles from './page.module.css';

export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <main className={styles.offline}>
      <div className={styles.brand}>
        <div className={styles.wordmark}>densa</div>
        <Spinner size={30} thickness={2.5} centered={false} />
      </div>
    </main>
  );
}
