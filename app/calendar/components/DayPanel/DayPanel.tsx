'use client';

import { type ReactNode, useMemo, useState, useEffect } from 'react';
import {
  format,
  isSameDay,
  isToday,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from './DayPanel.module.css';
import type { Appointment } from '../../hooks/useCalendar';
import { getCategoryColor, getStatusConfig, normalizeStatus, STATUS_CONFIG } from '@/lib/appointment-colors';

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
  onHoverAppointment?: (id: number | null) => void;
}

const STATUS_KEYS = ['scheduled', 'completed', 'cancelled', 'no-show'] as const;

// Appointment card
function AppointmentCard({
  appointment: apt,
  onClick,
  onStatusChange,
  onHoverAppointment,
  dateLabel,
}: {
  appointment: Appointment;
  onClick: (a: Appointment) => void;
  onStatusChange: (id: number, status: string) => void;
  onHoverAppointment?: (id: number | null) => void;
  dateLabel?: string;
}) {
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  const start         = new Date(apt.start_time);
  const end           = new Date(apt.end_time);
  const isPast        = end.getTime() < Date.now();
  const status        = normalizeStatus(apt.status);
  const statusCfg     = getStatusConfig(status);
  const categoryColor = getCategoryColor(apt.category);
  const durationMin   = Math.round((end.getTime() - start.getTime()) / 60_000);

  return (
    <div className={styles.cardWrapper}>
      {dateLabel && (
        <div className={styles.cardDateLabel}>{dateLabel}</div>
      )}
      <div
        className={`${styles.card} ${isPast ? styles.cardPast : ''}`}
        onClick={() => {
          if (statusMenuOpen) { setStatusMenuOpen(false); return; }
          onClick(apt);
        }}
        onMouseEnter={() => onHoverAppointment?.(apt.id)}
        onMouseLeave={() => onHoverAppointment?.(null)}
      >
        <div className={styles.colorBar} style={{ background: categoryColor }} />
        <div className={styles.cardBody}>

          {/* Top row: time · duration · service */}
          <div className={styles.timeRow}>
            <span className={styles.time}>{format(start, 'HH:mm')}</span>
            <span className={styles.timeSep}>·</span>
            <span className={styles.duration}>{durationMin} min</span>
            <span className={styles.timeSep}>·</span>
            <span className={styles.service}>{apt.service_name}</span>
          </div>

          {/* Client name */}
          <p className={styles.clientName}>{apt.client_name}</p>

          {/* Status control — tap to expand */}
          <div
            className={styles.statusLine}
            onClick={(e) => {
              e.stopPropagation();
              setStatusMenuOpen((prev) => !prev);
            }}
            role="button"
            tabIndex={0}
            aria-expanded={statusMenuOpen}
            aria-label={`Status: ${statusCfg.label}. Apasa pentru a schimba.`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setStatusMenuOpen((prev) => !prev);
              }
              if (e.key === 'Escape') setStatusMenuOpen(false);
            }}
          >
            <div className={styles.statusLineLeft}>
              <span
                className={styles.statusDot}
                style={{ background: statusCfg.dot }}
                aria-hidden="true"
              />
              <span className={styles.statusValue}>{statusCfg.label}</span>
            </div>
            <svg
              className={`${styles.statusChevron} ${statusMenuOpen ? styles.chevronOpen : ''}`}
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {/* Status dropdown menu */}
          {statusMenuOpen && (
            <div className={styles.statusMenu} onClick={(e) => e.stopPropagation()}>
              {STATUS_KEYS.map((key) => {
                const cfg = STATUS_CONFIG[key];
                const isActive = status === key;
                return (
                  <button
                    key={key}
                    className={`${styles.statusMenuItem} ${isActive ? styles.statusMenuItemActive : ''}`}
                    onClick={() => {
                      onStatusChange(apt.id, key);
                      setStatusMenuOpen(false);
                    }}
                  >
                    <span
                      className={styles.statusMenuDot}
                      style={{ background: cfg.dot }}
                      aria-hidden="true"
                    />
                    <span className={styles.statusMenuLabel}>{cfg.label}</span>
                    {isActive && (
                      <svg
                        className={styles.statusMenuCheck}
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
  onHoverAppointment,
}: DayPanelProps) {
  type StatusFilter = 'all' | 'scheduled' | 'completed' | 'cancelled';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Reset filter when day changes
  useEffect(() => {
    setStatusFilter('all');
  }, [selectedDay]);

  const isSearching = searchQuery.trim().length > 0;

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
  }, [appointments, searchQuery]);

  const searchStats = useMemo(() => ({
    total:     searchResults.length,
    scheduled: searchResults.filter((a) => normalizeStatus(a.status) === 'scheduled').length,
    completed: searchResults.filter((a) => normalizeStatus(a.status) === 'completed').length,
    other:     searchResults.filter((a) => {
      const s = normalizeStatus(a.status);
      return s === 'cancelled' || s === 'no-show';
    }).length,
  }), [searchResults]);

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

  const filteredDayAppointments = useMemo(() => {
    if (statusFilter === 'all') return dayAppointments;
    if (statusFilter === 'scheduled') return dayAppointments.filter((a) => normalizeStatus(a.status) === 'scheduled');
    if (statusFilter === 'completed') return dayAppointments.filter((a) => normalizeStatus(a.status) === 'completed');
    if (statusFilter === 'cancelled') return dayAppointments.filter((a) => {
      const s = normalizeStatus(a.status);
      return s === 'cancelled' || s === 'no-show';
    });
    return dayAppointments;
  }, [dayAppointments, statusFilter]);

  const stats = isSearching ? searchStats : dayStats;

  const groupedResults = useMemo(() => {
    if (!isSearching) return [];
    const groups: { dateKey: string; label: string; items: Appointment[] }[] = [];
    for (const apt of searchResults) {
      const d   = new Date(apt.start_time);
      const key = format(d, 'yyyy-MM-dd');
      let group = groups.find((g) => g.dateKey === key);
      if (!group) {
        const label = isToday(d)
          ? 'Astazi'
          : format(d, 'EEEE, d MMMM yyyy', { locale: ro });
        group = { dateKey: key, label: label.charAt(0).toUpperCase() + label.slice(1), items: [] };
        groups.push(group);
      }
      group.items.push(apt);
    }
    return groups;
  }, [searchResults]);

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

      {isSearching ? (
        <>
          <header className={styles.header}>
            <h3 className={styles.headerDate}>Rezultate: &ldquo;{searchQuery}&rdquo;</h3>
            <span className={styles.searchResultsBadge}>{searchStats.total}</span>
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
                        onNavigate(new Date(a.start_time));
                        onAppointmentClick(a);
                      }}
                      onStatusChange={onQuickStatusChange}
                      onHoverAppointment={onHoverAppointment}
                    />
                  ))}
                </div>
              ))
            )}
          </div>
        </>
      ) : (
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
                  + Programare
                </button>
              </header>

              {dayStats.total > 0 && (
                <div className={styles.statsGrid}>
                  <div
                    className={`${styles.statCard} ${statusFilter === 'all' ? styles.statCardActive : ''}`}
                    onClick={() => setStatusFilter('all')}
                    role="button"
                    tabIndex={0}
                    aria-pressed={statusFilter === 'all'}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setStatusFilter('all'); }}
                  >
                    <span className={styles.statCardValue}>{dayStats.total}</span>
                    <span className={styles.statCardLabel}>Total</span>
                  </div>
                  <div
                    className={`${styles.statCard} ${statusFilter === 'scheduled' ? styles.statCardActive : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'scheduled' ? 'all' : 'scheduled')}
                    role="button"
                    tabIndex={0}
                    aria-pressed={statusFilter === 'scheduled'}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setStatusFilter(statusFilter === 'scheduled' ? 'all' : 'scheduled'); }}
                  >
                    <span className={`${styles.statCardValue} ${styles.statScheduled}`}>{dayStats.scheduled}</span>
                    <span className={styles.statCardLabel}>Programate</span>
                  </div>
                  <div
                    className={`${styles.statCard} ${statusFilter === 'completed' ? styles.statCardActive : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
                    role="button"
                    tabIndex={0}
                    aria-pressed={statusFilter === 'completed'}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed'); }}
                  >
                    <span className={`${styles.statCardValue} ${styles.statCompleted}`}>{dayStats.completed}</span>
                    <span className={styles.statCardLabel}>Finalizate</span>
                  </div>
                  <div
                    className={`${styles.statCard} ${statusFilter === 'cancelled' ? styles.statCardActive : ''}`}
                    onClick={() => setStatusFilter(statusFilter === 'cancelled' ? 'all' : 'cancelled')}
                    role="button"
                    tabIndex={0}
                    aria-pressed={statusFilter === 'cancelled'}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setStatusFilter(statusFilter === 'cancelled' ? 'all' : 'cancelled'); }}
                  >
                    <span className={`${styles.statCardValue} ${styles.statOther}`}>{dayStats.other}</span>
                    <span className={styles.statCardLabel}>Anulate</span>
                  </div>
                </div>
              )}

              {searchBar}

              <div className={styles.list}>
                {filteredDayAppointments.length === 0 ? (
                  <div className={styles.emptyDay}>
                    <svg className={styles.emptyDayEmoji} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <p className={styles.emptyDayText}>
                      {statusFilter !== 'all'
                        ? 'Nicio programare cu acest status pentru aceasta zi.'
                        : 'Nicio programare pentru aceasta zi. Apasa + Programare pentru a crea una.'}
                    </p>
                  </div>
                ) : (
                  filteredDayAppointments.map((apt) => (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      onClick={onAppointmentClick}
                      onStatusChange={onQuickStatusChange}
                      onHoverAppointment={onHoverAppointment}
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
