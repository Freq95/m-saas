'use client';

import { type ReactNode, useMemo } from 'react';
import {
  format,
  isSameDay,
  isToday,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from './DayPanel.module.css';
import type { Appointment } from '../../hooks/useCalendar';

interface DayPanelProps {
  topControls?: ReactNode;
  selectedDay: Date | null;
  appointments: Appointment[];
  searchQuery?: string;
  onAppointmentClick: (appointment: Appointment) => void;
  onQuickStatusChange: (id: number, status: string) => void;
  onCreateClick: () => void;
  onNavigate: (date: Date) => void;
  onSearchChange?: (query: string) => void;
}

type PanelStatusKey = 'scheduled' | 'completed' | 'cancelled' | 'no-show';

const STATUS_CONFIG: Record<PanelStatusKey, { label: string; pillClass: string }> = {
  scheduled: { label: 'Programat',  pillClass: 'statusPillScheduled' },
  completed: { label: 'Finalizat',  pillClass: 'statusPillFinalizat' },
  cancelled: { label: 'Anulat',     pillClass: 'statusPillAnulat' },
  'no-show': { label: 'Absent',     pillClass: 'statusPillAbsent' },
};

function normalizeStatus(status: string): PanelStatusKey {
  if (status === 'no_show' || status === 'no-show') return 'no-show';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

// Appointment card
function AppointmentCard({
  appointment: apt,
  onClick,
  onStatusChange,
  dateLabel,
}: {
  appointment: Appointment;
  onClick: (a: Appointment) => void;
  onStatusChange: (id: number, status: string) => void;
  /** When set, shows a date stamp above the card (used in search results mode) */
  dateLabel?: string;
}) {
  const start       = new Date(apt.start_time);
  const end         = new Date(apt.end_time);
  const isPast      = end.getTime() < Date.now();
  const status      = normalizeStatus(apt.status);
  const cfg         = STATUS_CONFIG[status];
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60_000);

  return (
    <div className={styles.cardWrapper}>
      {dateLabel && (
        <div className={styles.cardDateLabel}>{dateLabel}</div>
      )}
      <div className={`${styles.card} ${isPast ? styles.cardPast : ''}`} onClick={() => onClick(apt)}>
        <div className={styles.colorBar} style={{ background: apt.color || 'var(--color-accent)' }} />
        <div className={styles.cardBody}>
          <div className={styles.timeRow}>
            <span className={styles.time}>
              {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
            </span>
            <span className={styles.duration}>{durationMin} min</span>
          </div>
          <p className={styles.clientName}>{apt.client_name}</p>
          <div className={styles.metaRow}>
            <span className={styles.service}>{apt.service_name}</span>
            <span className={`${styles.statusPill} ${styles[cfg.pillClass]}`}>
              {cfg.label}
            </span>
          </div>
          <div className={styles.statusSelector} onClick={(e) => e.stopPropagation()}>
            <button
              className={`${styles.statusBtn} ${styles.statusBtnFinalizat} ${status === 'completed' ? styles.statusBtnActive : ''}`}
              onClick={() => onStatusChange(apt.id, 'completed')}
              title="Marcheaza ca Finalizat"
            >
              Finalizat
            </button>
            <button
              className={`${styles.statusBtn} ${styles.statusBtnAnulat} ${status === 'cancelled' ? styles.statusBtnActive : ''}`}
              onClick={() => onStatusChange(apt.id, 'cancelled')}
              title="Marcheaza ca Anulat"
            >
              Anulat
            </button>
            <button
              className={`${styles.statusBtn} ${styles.statusBtnAbsent} ${status === 'no-show' ? styles.statusBtnActive : ''}`}
              onClick={() => onStatusChange(apt.id, 'no-show')}
              title="Marcheaza ca Absent"
            >
              Absent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main panel
export function DayPanel({
  topControls,
  selectedDay,
  appointments,
  searchQuery = '',
  onAppointmentClick,
  onQuickStatusChange,
  onCreateClick,
  onNavigate,
  onSearchChange,
}: DayPanelProps) {
  const isSearching  = searchQuery.trim().length > 0;

  // Search results: all appointments matching the query, sorted by date
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = searchQuery.toLowerCase();
    return [...appointments]
      .filter((apt) =>
        apt.client_name.toLowerCase().includes(q) ||
        apt.service_name.toLowerCase().includes(q) ||
        apt.category?.toLowerCase().includes(q) ||
        apt.notes?.toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [appointments, searchQuery, isSearching]);

  // Search result stats
  const searchStats = useMemo(() => ({
    total:     searchResults.length,
    scheduled: searchResults.filter((a) => normalizeStatus(a.status) === 'scheduled').length,
    completed: searchResults.filter((a) => normalizeStatus(a.status) === 'completed').length,
    other:     searchResults.filter((a) => {
      const s = normalizeStatus(a.status);
      return s === 'cancelled' || s === 'no-show';
    }).length,
  }), [searchResults]);

  // Day appointments (normal mode)
  const dayAppointments = useMemo(() => {
    if (!selectedDay) return [];
    return [...appointments]
      .filter((apt) => isSameDay(new Date(apt.start_time), selectedDay))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [selectedDay, appointments]);

  const dayStats = useMemo(() => ({
    total:     dayAppointments.length,
    scheduled: dayAppointments.filter((a) => normalizeStatus(a.status) === 'scheduled').length,
    completed: dayAppointments.filter((a) => normalizeStatus(a.status) === 'completed').length,
    other:     dayAppointments.filter((a) => {
      const s = normalizeStatus(a.status);
      return s === 'cancelled' || s === 'no-show';
    }).length,
  }), [dayAppointments]);

  const stats = isSearching ? searchStats : dayStats;

  // Group search results by day so we can show date separators
  const groupedResults = useMemo(() => {
    if (!isSearching) return [];
    const groups: { dateKey: string; label: string; items: Appointment[] }[] = [];
    for (const apt of searchResults) {
      const d    = new Date(apt.start_time);
      const key  = format(d, 'yyyy-MM-dd');
      let group  = groups.find((g) => g.dateKey === key);
      if (!group) {
        const label = isToday(d)
          ? 'Astazi'
          : format(d, "EEEE, d MMMM yyyy", { locale: ro });
        group = { dateKey: key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] };
        groups.push(group);
      }
      group.items.push(apt);
    }
    return groups;
  }, [searchResults, isSearching]);
  const searchBar = onSearchChange ? (
    <div className={styles.searchWrapper}>
      <svg className={styles.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <input
        type="search"
        className={styles.searchInput}
        placeholder="Cauta programari..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="Cauta programari"
      />
      {isSearching && (
        <button
          className={styles.searchClear}
          type="button"
          onClick={() => onSearchChange('')}
          aria-label="Sterge cautarea"
          title="Sterge cautarea"
        >
          {'\u00D7'}
        </button>
      )}
    </div>
  ) : null;
  return (
    <aside className={styles.panel}>
      {topControls}

      {/* Search mode header */}
      {isSearching ? (
        <>
          <header className={styles.header}>
            <h3 className={styles.headerDate}>Rezultate cautare: &ldquo;{searchQuery}&rdquo;</h3>
            <span className={styles.searchResultsBadge}>
              {searchStats.total}
            </span>
          </header>

          {/* Stats for search results */}
          {stats.total > 0 && (
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statCardValue}>{stats.total}</span>
              <span className={styles.statCardLabel}>Total</span>
            </div>
            <div className={styles.statCard}>
              <span className={`${styles.statCardValue} ${styles.statScheduled}`}>{stats.scheduled}</span>
              <span className={styles.statCardLabel}>Programate</span>
            </div>
            <div className={styles.statCard}>
              <span className={`${styles.statCardValue} ${styles.statCompleted}`}>{stats.completed}</span>
              <span className={styles.statCardLabel}>Finalizate</span>
            </div>
            <div className={styles.statCard}>
              <span className={`${styles.statCardValue} ${styles.statOther}`}>{stats.other}</span>
              <span className={styles.statCardLabel}>Anulate</span>
            </div>
          </div>
          )}

          {searchBar}

          {/* Search results list */}
          <div className={styles.list}>
            {groupedResults.length === 0 ? (
              <div className={styles.emptyDay}>
                <svg className={styles.emptyDayEmoji} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <p className={styles.emptyDayText}>
                  Nicio programare gasita pentru &ldquo;{searchQuery}&rdquo;
                </p>
              </div>
            ) : (
              groupedResults.map((group) => (
                <div key={group.dateKey} className={styles.resultGroup}>
                  <div className={styles.resultGroupLabel}>
                    <span className={styles.resultGroupDate}>{group.label}</span>
                    <span className={styles.resultGroupCount}>{group.items.length}</span>
                  </div>
                  {group.items.map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      onClick={(a) => {
                        // Navigate to the appointment's day, then open it
                        onNavigate(new Date(a.start_time));
                        onAppointmentClick(a);
                      }}
                      onStatusChange={onQuickStatusChange}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        /* Normal mode */
        <>
          {!selectedDay ? (
            <div className={styles.emptyPlaceholder}>
              <svg className={styles.emptyEmoji} width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <p className={styles.emptyTitle}>Selecteaza o zi din calendar pentru a vedea programarile.</p>
            </div>
          ) : (
            <>
              <header className={styles.header}>
                <h3 className={styles.headerDate}>
                  {isToday(selectedDay)
                    ? `Astazi, ${format(selectedDay, 'd MMMM', { locale: ro })}`
                    : format(selectedDay, 'EEEE, d MMMM', { locale: ro })}
                </h3>
                <button
                  className={styles.addBtn}
                  type="button"
                  onClick={onCreateClick}
                  aria-label="Adauga programare"
                >
                  + Adauga
                </button>
              </header>

              {stats.total > 0 && (
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statCardValue}>{stats.total}</span>
                  <span className={styles.statCardLabel}>Total</span>
                </div>
                <div className={styles.statCard}>
                  <span className={`${styles.statCardValue} ${styles.statScheduled}`}>{stats.scheduled}</span>
                  <span className={styles.statCardLabel}>Programate</span>
                </div>
                <div className={styles.statCard}>
                  <span className={`${styles.statCardValue} ${styles.statCompleted}`}>{stats.completed}</span>
                  <span className={styles.statCardLabel}>Finalizate</span>
                </div>
                <div className={styles.statCard}>
                  <span className={`${styles.statCardValue} ${styles.statOther}`}>{stats.other}</span>
                  <span className={styles.statCardLabel}>Anulate</span>
                </div>
              </div>
              )}

              {searchBar}

              <div className={styles.list}>
                {dayAppointments.length === 0 ? (
                  <div className={styles.emptyDay}>
                    <svg className={styles.emptyDayEmoji} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <p className={styles.emptyDayText}>Nicio programare pentru aceasta zi. Apasa + Adauga pentru a crea una.</p>
                  </div>
                ) : (
                  dayAppointments.map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      onClick={onAppointmentClick}
                      onStatusChange={onQuickStatusChange}
                    />
                  ))
                )}
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
}

