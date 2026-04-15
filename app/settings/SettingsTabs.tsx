'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from './SettingsTabs.module.css';
import {
  SETTINGS_TABS,
  SETTINGS_TAB_STORAGE_KEY,
  type SettingsTabKey,
} from './settings-tabs';

interface SettingsTabsProps {
  activeTab: SettingsTabKey;
}

export default function SettingsTabs({ activeTab }: SettingsTabsProps) {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  return (
    <nav className={styles.tabs} aria-label="Navigatie setari">
      {SETTINGS_TABS.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, tab.key);
              }
            }}
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
