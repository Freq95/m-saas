'use client';

import styles from '../page.module.css';

interface CalendarHeaderProps {
  rangeLabel: string;
  viewType: 'week' | 'month';
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onTodayClick: () => void;
  onViewTypeChange: (view: 'week' | 'month') => void;
}

export function CalendarHeader({
  rangeLabel,
  viewType,
  onPrevPeriod,
  onNextPeriod,
  onTodayClick,
  onViewTypeChange,
}: CalendarHeaderProps) {
  return (
    <div className={styles.calendarHeader}>
      <div className={styles.headerControls}>
        <button type="button" onClick={onPrevPeriod} aria-label="Perioada anterioara">
          &lt;
        </button>
        <h2>{rangeLabel}</h2>
        <button type="button" onClick={onNextPeriod} aria-label="Perioada urmatoare">
          &gt;
        </button>
        <button onClick={onTodayClick} className={styles.todayButton}>
          Astazi
        </button>
        <div className={styles.viewSwitcher}>
          <button
            type="button"
            onClick={() => onViewTypeChange('week')}
            className={viewType === 'week' ? styles.viewActive : styles.viewButton}
          >
            Saptamana
          </button>
          <button
            type="button"
            onClick={() => onViewTypeChange('month')}
            className={viewType === 'month' ? styles.viewActive : styles.viewButton}
          >
            Luna
          </button>
        </div>
      </div>
    </div>
  );
}
