'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true if the current viewport is at or below `breakpoint` pixels.
 *
 * The lazy useState initializer reads matchMedia synchronously on the first
 * client render so SPA navigations land with the correct value on first paint
 * — no desktop-layout-then-mobile-layout flash when entering a route on a
 * phone.
 *
 * On the very first server-rendered page load, the server cannot know the
 * viewport, so it defaults to false. After hydration, the lazy init returns
 * the real value; React reconciles in the same paint cycle so the flash is
 * limited to a single render before the browser shows pixels. SPA navigations
 * within the app are unaffected.
 */
export function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);

    // Resync in case the viewport changed between lazy-init and effect
    // (rare, but possible on slow renders or after a resize during nav).
    setIsMobile(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    const handleLegacyChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mediaQuery.addListener(handleLegacyChange);
    return () => mediaQuery.removeListener(handleLegacyChange);
  }, [breakpoint]);

  return isMobile;
}
