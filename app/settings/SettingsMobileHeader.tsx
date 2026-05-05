'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './SettingsMobileHeader.module.css';

const MOBILE_SETTINGS_BREAKPOINT = 780;
const SWIPE_DOWN_BACK_DISTANCE = 72;
const SWIPE_RIGHT_BACK_DISTANCE = 72;
const SWIPE_SIDE_TOLERANCE = 44;
const SWIPE_VERTICAL_TOLERANCE = 44;
const TOP_EDGE_TOLERANCE = 8;
const LEFT_EDGE_TOLERANCE = 36;

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('a, button, input, textarea, select, [role="button"]'));
}

export function SettingsMobileHeader({ title }: { title: string }) {
  const router = useRouter();
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.pointerType === 'mouse' ||
        window.innerWidth > MOBILE_SETTINGS_BREAKPOINT ||
        (window.scrollY > TOP_EDGE_TOLERANCE && event.clientX > LEFT_EDGE_TOLERANCE) ||
        isInteractiveTarget(event.target)
      ) {
        return;
      }

      swipeStartRef.current = { x: event.clientX, y: event.clientY };
    };

    const handlePointerUp = (event: PointerEvent) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (!start || window.innerWidth > MOBILE_SETTINGS_BREAKPOINT) {
        return;
      }

      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const isPullDownFromTop =
        window.scrollY <= TOP_EDGE_TOLERANCE &&
        deltaY >= SWIPE_DOWN_BACK_DISTANCE &&
        Math.abs(deltaX) <= SWIPE_SIDE_TOLERANCE;
      const isEdgeSwipeRight =
        start.x <= LEFT_EDGE_TOLERANCE &&
        deltaX >= SWIPE_RIGHT_BACK_DISTANCE &&
        Math.abs(deltaY) <= SWIPE_VERTICAL_TOLERANCE;

      if (isPullDownFromTop || isEdgeSwipeRight) {
        router.push('/settings');
      }
    };

    const handlePointerCancel = () => {
      swipeStartRef.current = null;
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerUp, { passive: true });
    window.addEventListener('pointercancel', handlePointerCancel, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [router]);

  return (
    <div className={styles.mobileHeader}>
      <Link href="/settings" prefetch={false} className={styles.backButton} aria-label="Inapoi la setari">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </Link>
      <h1 className={styles.title}>{title}</h1>
      <span aria-hidden="true" />
    </div>
  );
}
