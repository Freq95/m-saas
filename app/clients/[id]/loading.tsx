import styles from './page.module.css';
import Spinner from '@/components/Spinner';

export default function Loading() {
  return (
    <div className={styles.page}>
      <Spinner />
    </div>
  );
}
