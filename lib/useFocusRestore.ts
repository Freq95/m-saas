'use client';

import { useEffect, useRef } from 'react';

/**
 * Restore focus to the element that had focus when `active` flipped to true.
 * Called by modal/sheet components: when the modal opens, the previously
 * focused element (usually the trigger button) is captured; when the modal
 * closes, focus is returned to that element so keyboard and screen-reader
 * users don't lose their place in the tab order.
 *
 * Usage:
 *   useFocusRestore(isOpen);
 *
 * Skips restoration if the captured trigger has since been removed from the
 * DOM (e.g., conditional rendering), or if `active` was never true.
 */
export function useFocusRestore(active: boolean): void {
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof document === 'undefined') return;

    triggerRef.current = (document.activeElement as HTMLElement | null) ?? null;

    return () => {
      const trigger = triggerRef.current;
      if (!trigger || typeof trigger.focus !== 'function') return;
      if (!trigger.isConnected) return;
      // Defer so the modal's own unmount/transition completes first.
      // Without this the focus call can land on an element that is about
      // to be removed by sibling effects.
      requestAnimationFrame(() => {
        if (trigger.isConnected) trigger.focus({ preventScroll: false });
      });
    };
  }, [active]);
}
