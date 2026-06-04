'use client';

import { useEffect, useRef, useState } from 'react';
import { normalizeStatus, STATUS_CONFIG, type StatusKey } from '@/lib/calendar-color-policy';
import styles from './StatusPill.module.css';

const STATUS_KEYS: readonly StatusKey[] = ['scheduled', 'completed', 'cancelled', 'no-show'] as const;

interface StatusPillProps {
  /** Raw status string from the appointment doc (e.g. 'scheduled', 'no_show'). */
  status: string | null | undefined;
  /** Fired with the new status key when the user picks one. */
  onChange?: (next: StatusKey) => void;
  /** When false, the pill renders as a static label (no menu, no hover). */
  canChange?: boolean;
  /** Optional className passed to the outer pill for layout overrides. */
  className?: string;
}

/**
 * Color-coded status pill with a dropdown menu of valid transitions.
 *
 * Mirrors the inline status control used in DayPanel cards on mobile, so
 * dentists see the same widget on web (inside the appointment modal) and on
 * phone (on the day-list card). All labels come from STATUS_CONFIG so the
 * Romanian copy stays in one place.
 *
 * Pure UI: it doesn't issue any network requests itself. The parent owns
 * the PATCH via `onChange`, identical to DayPanel's `onStatusChange` pattern.
 */
export function StatusPill({ status, onChange, canChange = true, className }: StatusPillProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const normalized = normalizeStatus(status);
  const cfg = STATUS_CONFIG[normalized];

  // Close on outside click + Escape, so the menu doesn't trap the user.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!canChange) return;
    setOpen((prev) => !prev);
  };

  const handlePick = (next: StatusKey) => {
    setOpen(false);
    if (!onChange || next === normalized) return;
    onChange(next);
  };

  return (
    <div ref={rootRef} className={`${styles.root} ${className || ''}`.trim()}>
      <button
        type="button"
        className={`${styles.pill} ${!canChange ? styles.pillStatic : ''}`}
        style={{ '--status-color': cfg.dot } as React.CSSProperties}
        onClick={toggle}
        aria-expanded={canChange ? open : undefined}
        aria-haspopup={canChange ? 'menu' : undefined}
        aria-label={canChange ? `Status: ${cfg.label}. Apasa pentru a schimba.` : `Status: ${cfg.label}.`}
        disabled={!canChange}
      >
        <span className={styles.dot} style={{ background: cfg.dot }} aria-hidden="true" />
        <span className={styles.label}>{cfg.label}</span>
        {canChange && (
          <svg
            className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>
      {canChange && open && (
        <div className={styles.menu} role="menu">
          {STATUS_KEYS.map((key) => {
            const itemCfg = STATUS_CONFIG[key];
            const isActive = normalized === key;
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                className={`${styles.menuItem} ${isActive ? styles.menuItemActive : ''}`}
                onClick={() => handlePick(key)}
              >
                <span className={styles.menuDot} style={{ background: itemCfg.dot }} aria-hidden="true" />
                <span className={styles.menuLabel}>{itemCfg.label}</span>
                {isActive && (
                  <svg
                    className={styles.menuCheck}
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
