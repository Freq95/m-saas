'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  SETTINGS_TAB_STORAGE_KEY,
  getSettingsTabHref,
  isSettingsTabKey,
} from './settings-tabs';

export default function SettingsRedirectClient() {
  const router = useRouter();

  useEffect(() => {
    const savedTab =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(SETTINGS_TAB_STORAGE_KEY)
        : null;
    const target = isSettingsTabKey(savedTab)
      ? getSettingsTabHref(savedTab)
      : '/settings/calendars';

    router.replace(target);
  }, [router]);

  return null;
}
