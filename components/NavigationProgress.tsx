'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import styles from './NavigationProgress.module.css';

type PerfEvent = {
  name: string;
  path: string;
  href?: string;
  at: number;
  duration?: number;
};

type DensaPerfApi = {
  events: PerfEvent[];
  mark: (name: string, detail?: Record<string, string>) => void;
  measure: (name: string, startMark: string, endMark?: string) => number | null;
  getSnapshot: () => {
    events: PerfEvent[];
    marks: Array<{ name: string; startTime: number }>;
    measures: Array<{ name: string; startTime: number; duration: number }>;
    navigation: {
      startTime: number;
      domInteractive: number;
      domComplete: number;
      responseStart: number;
      responseEnd: number;
      loadEventEnd: number;
    } | null;
  };
};

declare global {
  interface Window {
    __densaPerf?: DensaPerfApi;
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function ensurePerf(): DensaPerfApi | null {
  if (typeof window === 'undefined' || typeof performance === 'undefined') return null;
  if (window.__densaPerf) return window.__densaPerf;

  const events: PerfEvent[] = [];
  window.__densaPerf = {
    events,
    mark(name, detail) {
      try {
        performance.mark(name, { detail });
      } catch {
        performance.mark(name);
      }
      events.push({
        name,
        path: window.location.pathname,
        href: detail?.href,
        at: now(),
      });
    },
    measure(name, startMark, endMark) {
      try {
        const measure = endMark
          ? performance.measure(name, startMark, endMark)
          : performance.measure(name, startMark);
        events.push({
          name,
          path: window.location.pathname,
          at: now(),
          duration: measure.duration,
        });
        return measure.duration;
      } catch {
        return null;
      }
    },
    getSnapshot() {
      const navigationEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      return {
        events: [...events],
        marks: performance.getEntriesByType('mark').map((entry) => ({
          name: entry.name,
          startTime: entry.startTime,
        })),
        measures: performance.getEntriesByType('measure').map((entry) => ({
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration,
        })),
        navigation: navigationEntry
          ? {
              startTime: navigationEntry.startTime,
              domInteractive: navigationEntry.domInteractive,
              domComplete: navigationEntry.domComplete,
              responseStart: navigationEntry.responseStart,
              responseEnd: navigationEntry.responseEnd,
              loadEventEnd: navigationEntry.loadEventEnd,
            }
          : null,
      };
    },
  };

  window.__densaPerf.mark('densa:app-hydrated');
  return window.__densaPerf;
}

function shouldTrackAnchor(anchor: HTMLAnchorElement): boolean {
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return false;

  return `${url.pathname}${url.search}` !== `${window.location.pathname}${window.location.search}`;
}

export default function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (maxRef.current) clearTimeout(maxRef.current);
    delayRef.current = null;
    maxRef.current = null;
  };

  const start = (href?: string) => {
    clearTimers();
    const perf = ensurePerf();
    startTimeRef.current = now();
    perf?.mark('densa:navigation-start', href ? { href } : undefined);
    delayRef.current = setTimeout(() => {
      setVisible(true);
      perf?.mark('densa:navigation-progress-visible', href ? { href } : undefined);
    }, 150);
    maxRef.current = setTimeout(() => {
      setVisible(false);
      startTimeRef.current = null;
    }, 8000);
  };

  const complete = () => {
    const perf = ensurePerf();
    clearTimers();
    if (startTimeRef.current !== null) {
      const duration = now() - startTimeRef.current;
      perf?.mark('densa:navigation-complete');
      perf?.events.push({
        name: 'densa:navigation-duration',
        path: window.location.pathname,
        at: now(),
        duration,
      });
    } else {
      perf?.mark('densa:route-ready');
    }
    startTimeRef.current = null;
    setVisible(false);
  };

  useEffect(() => {
    ensurePerf();

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || !shouldTrackAnchor(anchor)) return;
      start(anchor.href);
    };

    const onStart = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      start(typeof detail?.href === 'string' ? detail.href : undefined);
    };

    document.addEventListener('click', onClick, { capture: true });
    window.addEventListener('densa:navigation-start', onStart);
    return () => {
      document.removeEventListener('click', onClick, { capture: true });
      window.removeEventListener('densa:navigation-start', onStart);
      clearTimers();
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => complete());
  }, [pathname]);

  return (
    <div
      className={`${styles.progress} ${visible ? styles.visible : ''}`}
      data-testid="navigation-progress"
      aria-hidden="true"
    />
  );
}
