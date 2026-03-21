'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import RouteTransition from '@/components/RouteTransition';
import AppTopNav from '@/components/AppTopNav';

const HIDDEN_NAV_PREFIXES = ['/login', '/invite', '/admin'];

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideNav = HIDDEN_NAV_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (hideNav) {
      document.documentElement.style.setProperty('--app-nav-offset', '0px');
    }
  }, [hideNav]);

  return (
    <>
      {!hideNav && <AppTopNav />}
      <div className="app-shell-content">
        <RouteTransition>{children}</RouteTransition>
      </div>
    </>
  );
}
