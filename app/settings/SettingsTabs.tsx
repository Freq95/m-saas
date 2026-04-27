'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
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
  const { data: session } = useSession();
  const isOwner = session?.user?.role === 'owner';
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' });
    }
  }, [activeTab]);

  const visibleTabs = SETTINGS_TABS.filter((tab) => !tab.ownerOnly || isOwner);

  return (
    <>
      <nav ref={navRef} className={styles.tabs} aria-label="Navigatie setari">
      {visibleTabs.map((tab) => {
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
    </>
  );
}
