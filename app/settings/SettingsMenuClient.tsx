'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/components/ThemeProvider';
import styles from './SettingsMenu.module.css';
import navStyles from '../dashboard/page.module.css';
import { SETTINGS_EXIT_PATH_STORAGE_KEY } from './settings-tabs';

interface SettingsMenuClientProps {
  role: string;
  accountLabel: string;
}

const MOBILE_SETTINGS_BREAKPOINT = 640;
const SWIPE_DOWN_EXIT_DISTANCE = 72;
const SWIPE_RIGHT_EXIT_DISTANCE = 72;
const SWIPE_SIDE_TOLERANCE = 44;
const SWIPE_VERTICAL_TOLERANCE = 44;
const SWIPE_EXIT_DURATION_MS = 180;
const TOP_EDGE_TOLERANCE = 8;
const LEFT_EDGE_TOLERANCE = 36;

const MENU_GROUPS = [
  {
    label: 'Clinică',
    items: [
      {
        key: 'servicii',
        href: '/settings/services',
        label: 'Servicii Medicale',
        sub: 'Tipuri de consultații, durată și preț',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        ),
        ownerOnly: false,
      },
      {
        key: 'team',
        href: '/settings/team',
        label: 'Echipă',
        sub: 'Membri, roluri și invitații',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        ),
        ownerOnly: true,
      },
    ],
  },
  {
    label: 'Comunicare',
    items: [
      {
        key: 'calendare',
        href: '/settings/calendars',
        label: 'Calendare',
        sub: 'Partajare și permisiuni calendar',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
        ),
        ownerOnly: false,
      },
      {
        key: 'email',
        href: '/settings/email',
        label: 'Email',
        sub: 'Conturi conectate și sincronizare',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        ),
        ownerOnly: false,
      },
    ],
  },
  {
    label: 'Cont & Legal',
    items: [
      {
        key: 'account',
        href: '/settings/account',
        label: 'Contul meu',
        sub: 'Profil, email și parolă',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        ),
        ownerOnly: false,
      },
      {
        key: 'gdpr',
        href: '/settings/gdpr',
        label: 'GDPR',
        sub: 'Export date și conformitate',
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        ),
        ownerOnly: false,
      },
    ],
  },
];

export default function SettingsMenuClient({ role, accountLabel }: SettingsMenuClientProps) {
  const router = useRouter();
  const { theme, toggle } = useTheme();
  const isOwner = role === 'owner';
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const exitSettings = () => {
    const target =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(SETTINGS_EXIT_PATH_STORAGE_KEY)
        : null;
    router.push(target && !target.startsWith('/settings') ? target : '/dashboard');
  };

  const beginExit = () => {
    if (isExiting) return;

    if (
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.innerWidth > MOBILE_SETTINGS_BREAKPOINT
    ) {
      exitSettings();
      return;
    }

    setIsExiting(true);
    exitTimerRef.current = window.setTimeout(exitSettings, SWIPE_EXIT_DURATION_MS);
  };

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      event.pointerType === 'mouse' ||
      typeof window === 'undefined' ||
      window.innerWidth > MOBILE_SETTINGS_BREAKPOINT ||
      (window.scrollY > TOP_EDGE_TOLERANCE && event.clientX > LEFT_EDGE_TOLERANCE)
    ) {
      return;
    }

    swipeStartRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || isExiting) return;

    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    const isPullDownFromTop =
      typeof window !== 'undefined' &&
      window.scrollY <= TOP_EDGE_TOLERANCE &&
      deltaY >= SWIPE_DOWN_EXIT_DISTANCE &&
      Math.abs(deltaX) <= SWIPE_SIDE_TOLERANCE;
    const isEdgeSwipeRight =
      start.x <= LEFT_EDGE_TOLERANCE &&
      deltaX >= SWIPE_RIGHT_EXIT_DISTANCE &&
      Math.abs(deltaY) <= SWIPE_VERTICAL_TOLERANCE;

    if (isPullDownFromTop || isEdgeSwipeRight) {
      beginExit();
    }
  };

  return (
    <div className={navStyles.container}>
      <div
        className={`${styles.page} ${isExiting ? styles.pageExiting : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          swipeStartRef.current = null;
        }}
      >
        <h1 className={styles.pageTitle}>Setări</h1>
        <div className={styles.mobileHeader}>
          <button type="button" className={styles.mobileBackButton} onClick={beginExit} aria-label="Inapoi">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className={styles.mobileTitleGroup}>
            <h1 className={styles.mobileTitle}>Setări</h1>
            <p className={styles.mobileSubtitle}>{accountLabel}</p>
          </div>
          <span aria-hidden="true" />
        </div>
        <div className={styles.groups}>
          {MENU_GROUPS.map((group) => {
            const visibleItems = group.items.filter((item) => !item.ownerOnly || isOwner);
            if (visibleItems.length === 0) return null;
            return (
              <section key={group.label} className={styles.group}>
                <h2 className={styles.groupLabel}>{group.label}</h2>
                <div className={styles.groupItems}>
                  {visibleItems.map((item) => (
                    <Link key={item.key} href={item.href} className={styles.item}>
                      <span className={styles.itemIcon}>{item.icon}</span>
                      <span className={styles.itemText}>
                        <span className={styles.itemLabel}>{item.label}</span>
                        <span className={styles.itemSub}>{item.sub}</span>
                      </span>
                      <svg className={styles.itemArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <div className={styles.mobileSystemActions}>
          <div className={styles.mobileThemeRow}>
            <div className={styles.mobileThemeText}>
              <span className={styles.mobileThemeLabel}>Tema</span>
              <span className={styles.mobileThemeSub}>
                {theme === 'dark' ? 'Interfata intunecata' : 'Interfata luminoasa'}
              </span>
            </div>
            <button
              type="button"
              className={styles.mobileThemeToggle}
              onClick={toggle}
              aria-label={theme === 'dark' ? 'Schimba la tema luminoasa' : 'Schimba la tema intunecata'}
            >
              <span className={styles.mobileThemeToggleThumb} data-theme={theme} />
              <span className={styles.mobileThemeToggleIcon} aria-hidden="true">
                {theme === 'dark' ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                  </svg>
                )}
              </span>
            </button>
          </div>

          <button type="button" className={styles.mobileLogoutButton} onClick={() => setShowLogoutConfirm(true)}>
            Deconectare
          </button>
        </div>

        {showLogoutConfirm && (
          <div className={styles.mobileLogoutOverlay} role="dialog" aria-modal="true" aria-labelledby="settings-logout-title">
            <div className={styles.mobileLogoutSheet}>
              <h2 id="settings-logout-title">Deconectare cont</h2>
              <p>Sigur vrei sa te deconectezi din cont?</p>
              <div className={styles.mobileLogoutActions}>
                <button type="button" className={styles.mobileLogoutCancel} onClick={() => setShowLogoutConfirm(false)}>
                  Renunta
                </button>
                <button type="button" className={styles.mobileLogoutConfirm} onClick={() => signOut({ callbackUrl: '/login' })}>
                  Deconecteaza
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
