'use client';

import { useEffect, useState } from 'react';

export function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    // Match CSS breakpoints: `(max-width: 640px)` means mobile ≤ 640, desktop ≥ 641.
    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = (matches: boolean) => {
      setIsMobile(matches);
    };

    update(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      const handleChange = (event: MediaQueryListEvent) => update(event.matches);
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    // Legacy Safari fallback
    const handleLegacyChange = (event: MediaQueryListEvent) => update(event.matches);
    mediaQuery.addListener(handleLegacyChange);
    return () => mediaQuery.removeListener(handleLegacyChange);
  }, [breakpoint]);

  return isMobile;
}
