'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import AppTopNav from '@/components/AppTopNav';
import { SETTINGS_EXIT_PATH_STORAGE_KEY } from '@/app/settings/settings-tabs';

const HIDDEN_NAV_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/invite',
  '/calendar-invite',
  '/launch',
  '/admin',
  '/privacy',
  '/terms',
  '/plan', // public patient-facing treatment-plan share page
];

export default function AppChrome({
  children,
  userRole,
}: {
  children: React.ReactNode;
  userRole?: string | null;
}) {
  const pathname = usePathname();
  const hideNav = HIDDEN_NAV_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hideNav) {
      document.documentElement.style.setProperty('--app-nav-offset', '0px');
      document.documentElement.style.setProperty('--app-nav-bottom-offset', '0px');
    }
  }, [hideNav]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hideNav || pathname.startsWith('/settings')) return;
    window.localStorage.setItem(SETTINGS_EXIT_PATH_STORAGE_KEY, pathname || '/dashboard');
  }, [hideNav, pathname]);

  return (
    <>
      {!hideNav && <AppTopNav userRole={userRole} />}
      <div className="app-shell-content">{children}</div>
    </>
  );
}
