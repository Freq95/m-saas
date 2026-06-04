import Spinner from './Spinner';
import styles from './PageLoading.module.css';

// Unified loading state for the whole app. Renders a single spinner
// centered in the viewport via position:fixed so its location does not
// depend on the parent route's layout — same place on every page, every
// device. pointer-events:none keeps the persistent top/bottom navs
// clickable while the page is loading.
export default function PageLoading() {
  return (
    <div className={styles.page} aria-live="polite" aria-busy="true">
      <Spinner centered={false} />
    </div>
  );
}
