'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './AppTopNav.module.css';

type NavSection = 'dashboard' | 'inbox' | 'calendar' | 'clients' | 'settings' | null;

interface AppTopNavProps {
  section?: NavSection;
  navClassName?: string;
  logoClassName?: string;
  navLinksClassName?: string;
  logoText?: string;
}

interface IndicatorState {
  x: number;
  width: number;
  visible: boolean;
}

const NAV_ITEMS = [
  { key: 'dashboard', href: '/dashboard', label: 'Dashboard' },
  { key: 'inbox', href: '/inbox', label: 'Inbox' },
  { key: 'calendar', href: '/calendar', label: 'Calendar' },
  { key: 'clients', href: '/clients', label: 'Clienti' },
  { key: 'settings', href: '/settings/email', label: 'Setari' },
] as const;

function detectSection(pathname: string | null): NavSection {
  if (!pathname) return null;
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/inbox')) return 'inbox';
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/clients')) return 'clients';
  if (pathname.startsWith('/settings')) return 'settings';
  return null;
}

export default function AppTopNav({
  section,
  navClassName,
  logoClassName,
  navLinksClassName,
  logoText = 'OpsGenie',
}: AppTopNavProps) {
  const pathname = usePathname();
  const activeSection = section ?? detectSection(pathname);
  const linksRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<IndicatorState>({ x: 0, width: 0, visible: false });

  const activeHref = useMemo(() => {
    const match = NAV_ITEMS.find((item) => item.key === activeSection);
    return match?.href ?? null;
  }, [activeSection]);

  useEffect(() => {
    const updateIndicator = () => {
      const container = linksRef.current;
      if (!container || !activeHref) {
        setIndicator((prev) => ({ ...prev, visible: false }));
        return;
      }

      const activeEl = container.querySelector<HTMLAnchorElement>(`a[href="${activeHref}"]`);
      if (!activeEl) {
        setIndicator((prev) => ({ ...prev, visible: false }));
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();
      setIndicator({
        x: activeRect.left - containerRect.left,
        width: activeRect.width,
        visible: true,
      });
    };

    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [activeHref, pathname]);

  return (
    <nav className={navClassName || styles.nav}>
      <Link href="/" prefetch>
        <h1 className={logoClassName || styles.logo}>{logoText}</h1>
      </Link>
      <div ref={linksRef} className={navLinksClassName ? `${navLinksClassName} ${styles.links}` : styles.links}>
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === activeSection;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={`${styles.link} ${isActive ? styles.activeLink : ''}`}
            >
              {item.label}
            </Link>
          );
        })}
        <span
          className={`${styles.indicator} ${indicator.visible ? styles.indicatorVisible : ''}`}
          style={{
            width: `${indicator.width}px`,
            transform: `translateX(${indicator.x}px)`,
          }}
          aria-hidden="true"
        />
      </div>
    </nav>
  );
}
