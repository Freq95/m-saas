'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import styles from './SettingsTabs.module.css';
import {
  SETTINGS_TABS,
  type SettingsTabKey,
} from './settings-tabs';

interface SettingsTabsProps {
  activeTab: SettingsTabKey;
}

export default function SettingsTabs({ activeTab }: SettingsTabsProps) {
  const { data: session } = useSession();
  const isOwner = session?.user?.role === 'owner';
  const navRef = useRef<HTMLElement>(null);
  const [optimisticActiveTab, setOptimisticActiveTab] = useState<SettingsTabKey>(activeTab);

  useEffect(() => {
    setOptimisticActiveTab(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'auto' });
    }
  }, [optimisticActiveTab]);

  const visibleTabs = SETTINGS_TABS.filter((tab) => !tab.ownerOnly || isOwner);

  return (
    <>
      <nav ref={navRef} className={styles.tabs} aria-label="Navigatie setari">
      {visibleTabs.map((tab) => {
        const isActive = tab.key === optimisticActiveTab;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            onPointerDown={() => {
              setOptimisticActiveTab(tab.key);
            }}
            onClick={() => {
              setOptimisticActiveTab(tab.key);
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
