'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import styles from './AppTopNav.module.css';
import { useTheme } from './ThemeProvider';
import { useViewTransitionRouter } from '@/lib/useViewTransitionRouter';

function scrollToTopAndRefresh(refresh: () => void) {
  // Twitter-style same-tab click: scroll viewport to top, then refetch data.
  // window.scrollTo handles document-level scrollers; mobile pages with
  // position:fixed containers can opt in by scrolling their own region.
  if (typeof window !== 'undefined') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  refresh();
}

type NavSection = 'dashboard' | 'inbox' | 'calendar' | 'clients' | 'settings' | null;

interface AppTopNavProps {
  section?: NavSection;
  navClassName?: string;
  logoClassName?: string;
  navLinksClassName?: string;
  logoText?: string;
  userRole?: string | null;
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
  { key: 'clients', href: '/clients', label: 'Pacienti' },
] as const;

const MOBILE_SETTINGS_BREAKPOINT = 780;

function detectSection(pathname: string | null): NavSection {
  if (!pathname) return null;
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/inbox')) return 'inbox';
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/clients')) return 'clients';
  if (pathname.startsWith('/settings')) return 'settings';
  return null;
}

function CalendarNavIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function HomeNavIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

function MailNavIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function ClientsNavIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function SettingsNavIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function NavItemIcon({ itemKey }: { itemKey: NavSection }) {
  if (itemKey === 'dashboard') return <HomeNavIcon />;
  if (itemKey === 'inbox') return <MailNavIcon />;
  if (itemKey === 'calendar') return <CalendarNavIcon />;
  if (itemKey === 'clients') return <ClientsNavIcon />;
  if (itemKey === 'settings') return <SettingsNavIcon />;
  return null;
}

export default function AppTopNav({
  section,
  navClassName,
  logoClassName,
  navLinksClassName,
  logoText = 'densa',
  userRole = null,
}: AppTopNavProps) {
  const pathname = usePathname();
  const router = useViewTransitionRouter();
  const [storedUserRole, setStoredUserRole] = useState<string | null>(null);
  const { theme, toggle } = useTheme();
  const navRef = useRef<HTMLElement | null>(null);
  const detectedSection = section ?? detectSection(pathname);
  const [optimisticActiveSection, setOptimisticActiveSection] = useState<NavSection>(detectedSection);
  const activeSection = optimisticActiveSection ?? detectedSection;
  // Safety net for "button changes color but page never loads": if the
  // optimistic state diverges from the actual pathname for more than ~1.6s
  // after a click, router.push silently lost the navigation (queued behind
  // a stuck Server Action / pending fetch / etc). Fall back to a hard
  // window.location.assign so the user is never trapped on the old page.
  const pendingNavRef = useRef<{ href: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cancelPendingNav = () => {
    if (pendingNavRef.current) {
      clearTimeout(pendingNavRef.current.timer);
      pendingNavRef.current = null;
    }
  };
  const scheduleNavFallback = useCallback((href: string) => {
    cancelPendingNav();
    if (typeof window === 'undefined') return;
    pendingNavRef.current = {
      href,
      timer: setTimeout(() => {
        if (pendingNavRef.current?.href === href && window.location.pathname !== href) {
          window.location.assign(href);
        }
      }, 1600),
    };
  }, []);
  const linksRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<IndicatorState>({ x: 0, width: 0, visible: false });
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const logoutBackdropRef = useRef(false);

  // The "densa" logo routes to the calendar so logged-in users land on the
  // operational surface instead of the public marketing page.
  const homePath = '/calendar';
  const visibleNavItems = useMemo(() => {
    const role = userRole || storedUserRole;
    return role === 'asistent'
      ? NAV_ITEMS.filter((item) => item.key !== 'inbox')
      : NAV_ITEMS;
  }, [storedUserRole, userRole]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setStoredUserRole(window.localStorage.getItem('densa:userRole'));
  }, []);

  // Detect "click on the tab you're already on". With router.push to the
  // current URL Next.js does nothing, leaving the click feeling broken.
  // Returns true for both exact match and sub-route match (e.g., clicking
  // Pacienti while on /clients/123 is still "same tab").
  const isCurrentSection = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');
  const prefetchRoute = (href: string) => {
    if (isCurrentSection(href)) return;
    router.prefetch(href);
  };

  const activeHref = useMemo(() => {
    const match = visibleNavItems.find((item) => item.key === activeSection);
    return match?.href ?? null;
  }, [activeSection, visibleNavItems]);

  useEffect(() => {
    setOptimisticActiveSection(detectedSection);
    // Pathname changed — router.push succeeded, cancel the safety-net.
    cancelPendingNav();
  }, [detectedSection]);

  // Cleanup pending fallback on unmount so we never trigger a hard nav
  // after the component (and the user's intent) is gone.
  useEffect(() => () => cancelPendingNav(), []);

  useEffect(() => {
    const navElement = navRef.current;
    if (!navElement || typeof window === 'undefined') {
      return;
    }

    const updateNavOffset = () => {
      const height = Math.ceil(navElement.getBoundingClientRect().height);
      const isMobileBottomNav = window.matchMedia('(max-width: 640px)').matches;
      document.documentElement.style.setProperty('--app-nav-offset', isMobileBottomNav ? '0px' : `${height}px`);
      document.documentElement.style.setProperty('--app-nav-bottom-offset', isMobileBottomNav ? `${height}px` : '0px');
    };

    updateNavOffset();
    const mobileNavQuery = window.matchMedia('(max-width: 640px)');
    window.addEventListener('resize', updateNavOffset);
    if (typeof mobileNavQuery.addEventListener === 'function') {
      mobileNavQuery.addEventListener('change', updateNavOffset);
    } else {
      mobileNavQuery.addListener(updateNavOffset);
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => updateNavOffset());
      resizeObserver.observe(navElement);
    }

    return () => {
      window.removeEventListener('resize', updateNavOffset);
      if (typeof mobileNavQuery.removeEventListener === 'function') {
        mobileNavQuery.removeEventListener('change', updateNavOffset);
      } else {
        mobileNavQuery.removeListener(updateNavOffset);
      }
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
      <a
        href={homePath}
        onPointerEnter={() => prefetchRoute(homePath)}
        onTouchStart={() => prefetchRoute(homePath)}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          if (isCurrentSection(homePath)) {
            scrollToTopAndRefresh(router.refresh);
            return;
          }
          scheduleNavFallback(homePath);
          router.push(homePath);
        }}
      >
        <h1 className={logoClassName || styles.logo}>{logoText}</h1>
      </a>
      <div ref={linksRef} className={navLinksClassName ? `${navLinksClassName} ${styles.links}` : styles.links}>
        {visibleNavItems.map((item) => {
          const isActive = item.key === activeSection;
          return (
            <a
              key={item.href}
              href={item.href}
              aria-label={item.label}
              data-nav-key={item.key}
              className={`${styles.link} ${isActive ? styles.activeLink : ''}`}
              onPointerEnter={() => prefetchRoute(item.href)}
              onTouchStart={() => prefetchRoute(item.href)}
              onPointerDown={() => setOptimisticActiveSection(item.key)}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                setOptimisticActiveSection(item.key);
                if (isCurrentSection(item.href)) {
                  scrollToTopAndRefresh(router.refresh);
                  return;
                }
                scheduleNavFallback(item.href);
                router.push(item.href);
              }}
            >
              <span className={styles.linkLabel}>{item.label}</span>
              <span className={styles.linkCompactLabel}>{item.key === 'dashboard' ? 'Dash' : item.label}</span>
              <span className={styles.linkMobileIcon}><NavItemIcon itemKey={item.key} /></span>
              {item.key === 'calendar' && <span className={styles.linkCompactIcon}><CalendarNavIcon /></span>}
              {item.key === 'clients' && <span className={styles.linkCompactIcon}><ClientsNavIcon /></span>}
            </a>
          );
        })}
        <a
          href="/settings"
          aria-label="Setari"
          data-nav-key="settings"
          className={`${styles.link} ${styles.mobileSettingsLink} ${activeSection === 'settings' ? styles.activeLink : ''}`}
          onPointerEnter={() => prefetchRoute('/settings')}
          onTouchStart={() => prefetchRoute('/settings')}
          onPointerDown={() => setOptimisticActiveSection('settings')}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            setOptimisticActiveSection('settings');
            if (isCurrentSection('/settings')) {
              scrollToTopAndRefresh(router.refresh);
              return;
            }
            scheduleNavFallback('/settings');
            router.push('/settings');
          }}
        >
          <span className={styles.linkMobileIcon}><SettingsNavIcon /></span>
        </a>
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
        <a
          href="/settings"
          className={`${styles.settingsIcon} ${activeSection === 'settings' ? styles.settingsIconActive : ''}`}
          aria-label="Setări"
          title="Setări"
          onPointerDown={() => setOptimisticActiveSection('settings')}
          onPointerEnter={() => prefetchRoute('/settings/services')}
          onTouchStart={() => prefetchRoute('/settings/services')}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            setOptimisticActiveSection('settings');
            const target =
              typeof window !== 'undefined' && window.innerWidth > MOBILE_SETTINGS_BREAKPOINT
                ? '/settings/services'
                : '/settings';
            if (isCurrentSection('/settings')) {
              scrollToTopAndRefresh(router.refresh);
              return;
            }
            scheduleNavFallback(target);
            router.push(target);
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </a>
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
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.localStorage.removeItem('densa:userRole');
                  }
                  signOut({ callbackUrl: '/login' });
                }}
              >
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
