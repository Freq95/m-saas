'use client';

import Link from 'next/link';
import navStyles from '../app/dashboard/page.module.css';

interface NavigationProps {
  activePath?: string;
}

export default function Navigation({ activePath }: NavigationProps) {
  return (
    <nav className={navStyles.nav}>
      <Link href="/">
        <h1 className={navStyles.logo}>OpsGenie</h1>
      </Link>
      <div className={navStyles.navLinks}>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/inbox">Inbox</Link>
        <Link href="/calendar">Calendar</Link>
        <Link href="/clients">Clienți</Link>
        <Link 
          href="/settings/email" 
          className={activePath === '/settings/email' ? navStyles.active : undefined}
        >
          Setări
        </Link>
      </div>
    </nav>
  );
}

