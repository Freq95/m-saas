'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

interface AppRouter {
  push: (href: string) => void;
  replace: (href: string) => void;
  prefetch: (href: string) => void;
  refresh: () => void;
}

/**
 * Thin wrapper around next/navigation useRouter that exposes push, replace
 * and refresh as bound functions. Currently does an instant SPA navigation
 * with no animation — the loading.tsx Spinner covers the data-fetch window.
 *
 * Named `useViewTransitionRouter` for historical reasons; can be swapped to
 * wrap document.startViewTransition() if cross-fade transitions are
 * reintroduced.
 */
export function useViewTransitionRouter(): AppRouter {
  const router = useRouter();

  const push = useCallback((href: string) => router.push(href), [router]);
  const replace = useCallback((href: string) => router.replace(href), [router]);
  const prefetch = useCallback((href: string) => router.prefetch(href), [router]);
  const refresh = useCallback(() => router.refresh(), [router]);

  return { push, replace, prefetch, refresh };
}
