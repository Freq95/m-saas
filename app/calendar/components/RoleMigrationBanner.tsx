'use client';

import { useEffect, useState } from 'react';
import styles from './RoleMigrationBanner.module.css';

const DEPLOY_KEY = 'roles-v2-2026-05';

interface RoleMigrationBannerProps {
  userId?: string | number | null;
}

export function RoleMigrationBanner({ userId }: RoleMigrationBannerProps) {
  const storageKey = `role-migration-banner:${DEPLOY_KEY}:${userId ?? 'anonymous'}`;
  const [visible, setVisible] = useState<boolean | null>(null);

  useEffect(() => {
    setVisible(window.localStorage.getItem(storageKey) !== 'dismissed');
  }, [storageKey]);

  if (visible === false) return null;

  return (
    <div className={styles.banner} hidden={visible === null}>
      <div>
        <strong>Roluri actualizate.</strong>
        <span> Clinica ta are acum roluri pentru proprietar, medic, receptioner si asistent.</span>
      </div>
      <button
        type="button"
        onClick={() => {
          window.localStorage.setItem(storageKey, 'dismissed');
          setVisible(false);
        }}
      >
        Inchide
      </button>
    </div>
  );
}
