'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Returns true if the current viewport is at or below `breakpoint` pixels.
 *
 * Uses useSyncExternalStore so the hydration render uses the server snapshot
 * (always false), exactly matching the server-rendered HTML — no hydration
 * mismatch (React #418). Immediately after commit, React reconciles to the
 * real client snapshot, so the correct layout lands in the same paint cycle
 * without a desktop-then-mobile flash on SPA navigations.
 */
export function useIsMobile(breakpoint = 640): boolean {
  const query = `(max-width: ${breakpoint}px)`;

  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window === 'undefined') return () => {};
      const mql = window.matchMedia(query);
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', callback);
        return () => mql.removeEventListener('change', callback);
      }
      // Legacy Safari (<14)
      mql.addListener(callback);
      return () => mql.removeListener(callback);
    },
    [query]
  );

  const getSnapshot = useCallback(
    () => (typeof window === 'undefined' ? false : window.matchMedia(query).matches),
    [query]
  );

  // Server (and the hydration render) always sees false → matches SSR HTML.
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
