'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import styles from './AppTopNav.module.css';
import { useTheme } from './ThemeProvider';

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
  logoText = 'densa',
}: AppTopNavProps) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const navRef = useRef<HTMLElement | null>(null);
  const activeSection = section ?? detectSection(pathname);
  const linksRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<IndicatorState>({ x: 0, width: 0, visible: false });
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const logoutBackdropRef = useRef(false);

  const activeHref = useMemo(() => {
    const match = NAV_ITEMS.find((item) => item.key === activeSection);
    return match?.href ?? null;
  }, [activeSection]);

  useEffect(() => {
    const navElement = navRef.current;
    if (!navElement || typeof window === 'undefined') {
      return;
    }

    const updateNavOffset = () => {
      const height = Math.ceil(navElement.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--app-nav-offset', `${height}px`);
    };

    updateNavOffset();
    window.addEventListener('resize', updateNavOffset);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateNavOffset());
      resizeObserver.observe(navElement);
    }

    return () => {
      window.removeEventListener('resize', updateNavOffset);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [pathname]);

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
    <nav ref={navRef} className={navClassName || styles.nav}>
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
      <div className={styles.rightCluster}>
        <button
          className={styles.themeToggle}
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
        <Link
          href="/settings"
          prefetch
          className={`${styles.settingsIcon} ${activeSection === 'settings' ? styles.settingsIconActive : ''}`}
          aria-label="Setări"
          title="Setări"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </Link>
        <button
          className={styles.powerButton}
          onClick={() => setShowLogoutModal(true)}
          aria-label="Deconectare"
          title="Deconectare"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"/>
            <line x1="12" y1="2" x2="12" y2="12"/>
          </svg>
        </button>
      </div>

      {showLogoutModal && typeof document !== 'undefined' && createPortal(
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowLogoutModal(false);
          }}
          onPointerDown={(e) => { logoutBackdropRef.current = e.target === e.currentTarget; }}
          onClick={(e) => {
            if (logoutBackdropRef.current && e.target === e.currentTarget) setShowLogoutModal(false);
            logoutBackdropRef.current = false;
          }}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 id="logout-modal-title">Deconectare cont</h3>
            <p className={styles.modalBody}>
              Sigur vrei să te deconectezi din cont?
            </p>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnGhost} autoFocus onClick={() => setShowLogoutModal(false)}>
                Renunță
              </button>
              <button type="button" className={styles.btnDanger} onClick={() => signOut({ callbackUrl: '/login' })}>
                Deconectează
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </nav>
  );
}
