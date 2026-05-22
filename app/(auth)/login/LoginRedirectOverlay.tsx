'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Spinner from '@/components/Spinner';
import styles from './LoginRedirectOverlay.module.css';

interface LoginRedirectOverlayProps {
  onTimeout?: () => void;
}

export function LoginRedirectOverlay({ onTimeout }: LoginRedirectOverlayProps) {
  const [canPortal, setCanPortal] = useState(false);

  useEffect(() => {
    setCanPortal(true);
  }, []);

  useEffect(() => {
    if (!onTimeout) return;
    const timer = window.setTimeout(onTimeout, 10000);
    return () => window.clearTimeout(timer);
  }, [onTimeout]);

  if (!canPortal || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="status"
      aria-live="polite"
      aria-label="Se autentifica, te rog asteapta"
    >
      <Spinner size={32} thickness={3} centered={false} />
    </div>,
    document.body
  );
}
