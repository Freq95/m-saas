'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import styles from './SettingsTabs.module.css';
import {
  SETTINGS_TABS,
  type SettingsTabKey,
} from './settings-tabs';

interface SettingsTabsProps {
  activeTab: SettingsTabKey;
  /**
   * Server-known role override. When provided, takes precedence over the
   * client-side useSession() check (which can lag during hydration or carry a
   * stale JWT). Pages that already know the role from `getAuthUser()` should
   * pass this so owner-only tabs render reliably on first paint.
   */
  isOwner?: boolean;
}

export default function SettingsTabs({ activeTab, isOwner: isOwnerProp }: SettingsTabsProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const isOwner = typeof isOwnerProp === 'boolean'
    ? isOwnerProp
    : role === 'owner';
  // Clinical staff includes owner + dentists (plus super_admin). Used to
  // gate clinic-config tabs like Email from non-clinical roles.
  const isClinical = isOwner || role === 'dentist' || role === 'super_admin';
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

  const visibleTabs = SETTINGS_TABS.filter((tab) => {
    if (tab.ownerOnly && !isOwner) return false;
    if (tab.clinicalOnly && !isClinical) return false;
    return true;
  });

  return (
    <>
      <nav ref={navRef} className={styles.tabs} aria-label="Navigatie setari">
      {visibleTabs.map((tab) => {
        const isActive = tab.key === optimisticActiveTab;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            prefetch
            onPointerEnter={() => router.prefetch(tab.href)}
            onTouchStart={() => router.prefetch(tab.href)}
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
