'use client';

import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function BackButton() {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/login');
    }
  }

  return (
    <button type="button" onClick={handleBack} className={styles.backLink}>
      ← Inapoi
    </button>
  );
}
