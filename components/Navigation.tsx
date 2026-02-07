'use client';

import Link from 'next/link';
import navStyles from '../app/dashboard/page.module.css';

interface NavigationProps {
  activePath?: string;
}

export default function Navigation({ activePath }: NavigationProps) {
  return (
    <nav className={navStyles.nav}>
      <Link href="/" prefetch>
        <h1 className={navStyles.logo}>OpsGenie</h1>
      </Link>
      <div className={navStyles.navLinks}>
        <Link href="/dashboard" prefetch>Dashboard</Link>
        <Link href="/inbox" prefetch>Inbox</Link>
        <Link href="/calendar" prefetch>Calendar</Link>
        <Link href="/clients" prefetch>Clienți</Link>
        <Link 
          href="/settings/email" 
          className={activePath === '/settings/email' ? navStyles.active : undefined}
          prefetch
        >
          Setări
        </Link>
      </div>
    </nav>
  );
}

