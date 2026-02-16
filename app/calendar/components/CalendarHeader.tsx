'use client';

import { useRef } from 'react';
import styles from '../page.module.css';
import type { Provider, Resource } from '../hooks/useCalendar';

interface CalendarHeaderProps {
  rangeLabel: string;
  viewType: 'week' | 'month' | 'day';
  providers?: Provider[];
  resources?: Resource[];
  selectedProviderId?: number | null;
  selectedResourceId?: number | null;
  searchQuery?: string;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onTodayClick: () => void;
  onViewTypeChange: (view: 'week' | 'month' | 'day') => void;
  onProviderChange?: (providerId: number | null) => void;
  onResourceChange?: (resourceId: number | null) => void;
  onSearchChange?: (query: string) => void;
  onJumpToDate?: (date: Date) => void;
}

export function CalendarHeader({
  rangeLabel,
  viewType,
  providers = [],
  resources = [],
  selectedProviderId,
  selectedResourceId,
  searchQuery = '',
  onPrevPeriod,
  onNextPeriod,
  onTodayClick,
  onViewTypeChange,
  onProviderChange,
  onResourceChange,
  onSearchChange,
  onJumpToDate,
}: CalendarHeaderProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);

  const handleRangeLabelClick = () => {
    dateInputRef.current?.showPicker?.();
    dateInputRef.current?.click();
  };

  return (
    <div className={styles.calendarHeader}>
      <div className={styles.headerControls}>
        {/* Navigation */}
        <button type="button" onClick={onPrevPeriod} aria-label="Perioada anterioara">
          &lt;
        </button>

        {/* Range label — clickable to jump to date */}
        <h2
          className={styles.rangeLabelBtn}
          onClick={handleRangeLabelClick}
          title="Click pentru a sari la o data"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleRangeLabelClick(); }}
        >
          {rangeLabel}
        </h2>

        {/* Hidden date picker */}
        <input
          ref={dateInputRef}
          type="date"
          className={styles.hiddenDateInput}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.value && onJumpToDate) {
              onJumpToDate(new Date(e.target.value + 'T00:00:00'));
              e.target.value = '';
            }
          }}
        />

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

        {/* Search */}
        {onSearchChange && (
          <div className={styles.searchWrapper}>
            <span className={styles.searchIcon}>⌕</span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Cauta programari..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Cauta programari"
            />
          </div>
        )}

        {/* View switcher */}
        <div className={styles.viewSwitcher}>
          <button
            type="button"
            onClick={() => onViewTypeChange('day')}
            className={viewType === 'day' ? styles.viewActive : styles.viewButton}
          >
            Zi
          </button>
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
