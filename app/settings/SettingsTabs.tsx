'use client';

import Link from 'next/link';
import styles from './SettingsTabs.module.css';

type SettingsTabKey = 'email' | 'services' | 'gdpr';

interface SettingsTabsProps {
  activeTab: SettingsTabKey;
}

const TABS: Array<{ key: SettingsTabKey; href: string; label: string }> = [
  { key: 'email', href: '/settings/email', label: 'Email' },
  { key: 'services', href: '/settings/services', label: 'Servicii' },
  { key: 'gdpr', href: '/settings/gdpr', label: 'GDPR' },
];

export default function SettingsTabs({ activeTab }: SettingsTabsProps) {
  return (
    <nav className={styles.tabs} aria-label="Navigatie setari">
      {TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
