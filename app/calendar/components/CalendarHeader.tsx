'use client';

import styles from '../page.module.css';
import type { Provider, Resource } from '../hooks/useCalendar';

interface CalendarHeaderProps {
  rangeLabel: string;
  viewType: 'week' | 'month';
  providers?: Provider[];
  resources?: Resource[];
  selectedProviderId?: number | null;
  selectedResourceId?: number | null;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onTodayClick: () => void;
  onViewTypeChange: (view: 'week' | 'month') => void;
  onProviderChange?: (providerId: number | null) => void;
  onResourceChange?: (resourceId: number | null) => void;
}

export function CalendarHeader({
  rangeLabel,
  viewType,
  providers = [],
  resources = [],
  selectedProviderId,
  selectedResourceId,
  onPrevPeriod,
  onNextPeriod,
  onTodayClick,
  onViewTypeChange,
  onProviderChange,
  onResourceChange,
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

        {/* Provider Filter */}
        {providers.length > 0 && onProviderChange && (
          <select
            className={styles.filterSelect}
            value={selectedProviderId || ''}
            onChange={(e) => onProviderChange(e.target.value ? parseInt(e.target.value) : null)}
            aria-label="Filtreaza dupa furnizor"
          >
            <option value="">Toti furnizorii</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} ({provider.role})
              </option>
            ))}
          </select>
        )}

        {/* Resource Filter */}
        {resources.length > 0 && onResourceChange && (
          <select
            className={styles.filterSelect}
            value={selectedResourceId || ''}
            onChange={(e) => onResourceChange(e.target.value ? parseInt(e.target.value) : null)}
            aria-label="Filtreaza dupa resursa"
          >
            <option value="">Toate resursele</option>
            {resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name} ({resource.type})
              </option>
            ))}
          </select>
        )}

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
