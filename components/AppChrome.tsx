'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import RouteTransition from '@/components/RouteTransition';
import AppTopNav from '@/components/AppTopNav';
import { SETTINGS_EXIT_PATH_STORAGE_KEY } from '@/app/settings/settings-tabs';

const HIDDEN_NAV_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/invite',
  '/calendar-invite',
  '/admin',
  '/privacy',
  '/terms',
];

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = HIDDEN_NAV_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hideNav) {
      document.documentElement.style.setProperty('--app-nav-offset', '0px');
    }
  }, [hideNav]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hideNav || pathname.startsWith('/settings')) return;
    window.localStorage.setItem(SETTINGS_EXIT_PATH_STORAGE_KEY, pathname || '/dashboard');
  }, [hideNav, pathname]);

  return (
    <>
      {!hideNav && <AppTopNav />}
      <div className="app-shell-content">
        <RouteTransition>{children}</RouteTransition>
      </div>
    </>
  );
}
