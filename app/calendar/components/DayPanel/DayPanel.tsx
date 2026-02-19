'use client';

import { useMemo, useRef } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from './DayPanel.module.css';
import type { Appointment, CalendarViewType, Provider, Resource } from '../../hooks/useCalendar';

interface DayPanelProps {
  selectedDay: Date | null;
  appointments: Appointment[];
  currentDate: Date;
  rangeLabel: string;
  viewType: CalendarViewType;
  providers?: Provider[];
  resources?: Resource[];
  selectedProviderId?: number | null;
  selectedResourceId?: number | null;
  searchQuery?: string;
  onAppointmentClick: (appointment: Appointment) => void;
  onQuickStatusChange: (id: number, status: string) => void;
  onCreateClick: () => void;
  onNavigate: (date: Date) => void;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onTodayClick: () => void;
  onViewTypeChange: (view: CalendarViewType) => void;
  onProviderChange?: (providerId: number | null) => void;
  onResourceChange?: (resourceId: number | null) => void;
  onSearchChange?: (query: string) => void;
  onJumpToDate?: (date: Date) => void;
}

type PanelStatusKey = 'scheduled' | 'completed' | 'cancelled' | 'no-show';

const STATUS_CONFIG: Record<PanelStatusKey, { label: string; pillClass: string }> = {
  scheduled: { label: 'Programat',  pillClass: 'statusPillScheduled' },
  completed: { label: 'Completat',  pillClass: 'statusPillCompleted' },
  cancelled: { label: 'Anul.',      pillClass: 'statusPillCancelled' },
  'no-show': { label: 'Absent',     pillClass: 'statusPillNoShow' },
};

function normalizeStatus(status: string): PanelStatusKey {
  if (status === 'no_show' || status === 'no-show') return 'no-show';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

// ── Mini calendar ─────────────────────────────────────────────────────────────
function MiniCalendar({
  currentDate,
  selectedDay,
  appointments,
  onSelectDay,
}: {
  currentDate: Date;
  selectedDay: Date | null;
  appointments: Appointment[];
  onSelectDay: (date: Date) => void;
}) {
  const viewMonth = currentDate;

  const days = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const weekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const lastWeekStart = startOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: addDays(lastWeekStart, 6) });
  }, [viewMonth]);

  // Dot indicators use ALL appointments (not filtered)
  const aptDays = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach((a) => set.add(format(new Date(a.start_time), 'yyyy-MM-dd')));
    return set;
  }, [appointments]);

  const weekLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  return (
    <div className={styles.miniCal}>
      <div className={styles.miniCalHeader}>
        <button
          className={styles.miniCalNav}
          onClick={(e) => { e.stopPropagation(); onSelectDay(subMonths(viewMonth, 1)); }}
          aria-label="Luna anterioara"
        >
          {'<'}
        </button>
        <span className={styles.miniCalMonth}>
          {format(viewMonth, 'MMMM yyyy', { locale: ro })}
        </span>
        <button
          className={styles.miniCalNav}
          onClick={(e) => { e.stopPropagation(); onSelectDay(addMonths(viewMonth, 1)); }}
          aria-label="Luna urmatoare"
        >
          {'>'}
        </button>
      </div>

      <div className={styles.miniCalGrid}>
        {weekLabels.map((d, i) => (
          <span key={i} className={styles.miniCalWeekLabel}>{d}</span>
        ))}
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, viewMonth);
          const isTodayFlag    = isToday(day);
          const isSelected     = selectedDay ? isSameDay(day, selectedDay) : false;
          const hasApt         = aptDays.has(format(day, 'yyyy-MM-dd'));

          return (
            <button
              key={day.toISOString()}
              className={[
                styles.miniCalDay,
                !isCurrentMonth ? styles.miniCalDayOther    : '',
                isTodayFlag     ? styles.miniCalDayToday    : '',
                isSelected      ? styles.miniCalDaySelected : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onSelectDay(day)}
              aria-label={format(day, 'd MMMM yyyy', { locale: ro })}
              aria-pressed={isSelected}
            >
              {format(day, 'd')}
              {hasApt && <span className={styles.miniCalDot} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Appointment card ──────────────────────────────────────────────────────────
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
  const status      = normalizeStatus(apt.status);
  const cfg         = STATUS_CONFIG[status];
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60_000);

  return (
    <div className={styles.cardWrapper}>
      {dateLabel && (
        <div className={styles.cardDateLabel}>{dateLabel}</div>
      )}
      <div className={styles.card} onClick={() => onClick(apt)}>
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
          {apt.category && (
            <span className={styles.categoryTag} style={{ '--cat-color': apt.color || 'var(--color-accent)' } as React.CSSProperties}>
              {apt.category}
            </span>
          )}
          {status === 'scheduled' && (
            <div className={styles.quickActions} onClick={(e) => e.stopPropagation()}>
              <button
                className={`${styles.qBtn} ${styles.qComplete}`}
                onClick={() => onStatusChange(apt.id, 'completed')}
              >
                {'\u2713'} Completat
              </button>
              <button
                className={`${styles.qBtn} ${styles.qAbsent}`}
                onClick={() => onStatusChange(apt.id, 'no-show')}
              >
                {'\u26a0'} Absent
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function DayPanel({
  selectedDay,
  appointments,
  currentDate,
  rangeLabel,
  viewType,
  providers = [],
  resources = [],
  selectedProviderId = null,
  selectedResourceId = null,
  searchQuery = '',
  onAppointmentClick,
  onQuickStatusChange,
  onCreateClick,
  onNavigate,
  onPrevPeriod,
  onNextPeriod,
  onTodayClick,
  onViewTypeChange,
  onProviderChange,
  onResourceChange,
  onSearchChange,
  onJumpToDate,
}: DayPanelProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const isSearching  = searchQuery.trim().length > 0;

  // ── Search results: all appointments matching the query, sorted by date ──
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

  // ── Search result stats ───────────────────────────────────────────────────
  const searchStats = useMemo(() => ({
    total:     searchResults.length,
    scheduled: searchResults.filter((a) => normalizeStatus(a.status) === 'scheduled').length,
    completed: searchResults.filter((a) => normalizeStatus(a.status) === 'completed').length,
    other:     searchResults.filter((a) => {
      const s = normalizeStatus(a.status);
      return s === 'cancelled' || s === 'no-show';
    }).length,
  }), [searchResults]);

  // ── Day appointments (normal mode) ────────────────────────────────────────
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

  const handleRangeLabelClick = () => {
    dateInputRef.current?.showPicker?.();
    dateInputRef.current?.click();
  };

  return (
    <aside className={styles.panel}>

      {/* ── Controls ── */}
      <div className={styles.controlSection}>
        <div className={styles.controlRow}>
          <button type="button" className={styles.ctrlButton} onClick={onPrevPeriod} aria-label="Perioada anterioara">
            {'<'}
          </button>
          <button type="button" className={styles.rangeLabelButton} onClick={handleRangeLabelClick}>
            {rangeLabel}
          </button>
          <input
            ref={dateInputRef}
            type="date"
            className={styles.hiddenDateInput}
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              if (e.target.value && onJumpToDate) {
                onJumpToDate(new Date(`${e.target.value}T00:00:00`));
                e.target.value = '';
              }
            }}
          />
          <button type="button" className={styles.ctrlButton} onClick={onNextPeriod} aria-label="Perioada urmatoare">
            {'>'}
          </button>
          <button type="button" className={styles.todayButton} onClick={onTodayClick}>
            Astazi
          </button>
        </div>

        <div className={styles.controlRow}>
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
              {isSearching && (
                <button
                  className={styles.searchClear}
                  onClick={() => onSearchChange('')}
                  aria-label="Sterge cautarea"
                  title="Sterge cautarea"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          <div className={styles.selectGroup}>
            <select
              className={styles.selectControl}
              value={viewType}
              onChange={(e) => onViewTypeChange(e.target.value as CalendarViewType)}
              aria-label="Schimba vizualizarea"
            >
              <option value="day">Zi</option>
              <option value="week">Saptamana</option>
              <option value="workweek">Saptamana lucru</option>
              <option value="month">Luna</option>
            </select>

            {providers.length > 0 && onProviderChange && (
              <select
                className={styles.selectControl}
                value={selectedProviderId || ''}
                onChange={(e) => onProviderChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                aria-label="Filtreaza dupa furnizor"
              >
                <option value="">Toti furnizorii</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}

            {resources.length > 0 && onResourceChange && (
              <select
                className={styles.selectControl}
                value={selectedResourceId || ''}
                onChange={(e) => onResourceChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                aria-label="Filtreaza dupa resursa"
              >
                <option value="">Toate resursele</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* ── Mini calendar ── */}
      <MiniCalendar
        currentDate={currentDate}
        selectedDay={selectedDay}
        appointments={appointments}
        onSelectDay={onNavigate}
      />

      {/* ── Search mode header ── */}
      {isSearching ? (
        <>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <p className={styles.headerEyebrow}>Rezultate cautare</p>
              <h3 className={styles.headerDate} style={{ fontSize: '1rem' }}>
                &ldquo;{searchQuery}&rdquo;
              </h3>
            </div>
            <span className={styles.searchResultsBadge}>
              {searchStats.total}
            </span>
          </header>

          {/* Stats for search results */}
          <div className={styles.statsStrip}>
            <div className={styles.statItem}>
              <span className={styles.statNum}>{stats.total}</span>
              <span className={styles.statLabel}>Total</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={`${styles.statNum} ${styles.statNumScheduled}`}>{stats.scheduled}</span>
              <span className={styles.statLabel}>Programate</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={`${styles.statNum} ${styles.statNumCompleted}`}>{stats.completed}</span>
              <span className={styles.statLabel}>Complete</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.statItem}>
              <span className={`${styles.statNum} ${styles.statNumOther}`}>{stats.other}</span>
              <span className={styles.statLabel}>Anulate</span>
            </div>
          </div>

          {/* Search results list */}
          <div className={styles.list}>
            {groupedResults.length === 0 ? (
              <div className={styles.emptyDay}>
                <span className={styles.emptyDayEmoji}>🔍</span>
                <p className={styles.emptyDayText}>
                  Nicio programare gasita pentru &ldquo;{searchQuery}&rdquo;
                </p>
                <button className={styles.emptyDayBtn} onClick={() => onSearchChange?.('')}>
                  Sterge cautarea
                </button>
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
        /* ── Normal mode ── */
        <>
          {!selectedDay ? (
            <div className={styles.emptyPlaceholder}>
              <span className={styles.emptyEmoji}>📅</span>
              <p className={styles.emptyTitle}>Selecteaza o zi</p>
              <p className={styles.emptySubtitle}>
                Apasa pe o zi din calendar pentru a vedea si gestiona programarile.
              </p>
            </div>
          ) : (
            <>
              <header className={styles.header}>
                <div className={styles.headerLeft}>
                  <p className={styles.headerEyebrow}>
                    {isToday(selectedDay) ? 'Astazi' : format(selectedDay, 'EEEE', { locale: ro })}
                  </p>
                  <h3 className={styles.headerDate}>
                    {format(selectedDay, 'd MMMM', { locale: ro })}
                  </h3>
                </div>
                <button
                  className={styles.addBtn}
                  onClick={onCreateClick}
                  aria-label="Adauga programare noua"
                  title="Adauga programare"
                >
                  +
                </button>
              </header>

              <div className={styles.statsStrip}>
                <div className={styles.statItem}>
                  <span className={styles.statNum}>{stats.total}</span>
                  <span className={styles.statLabel}>Total</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <span className={`${styles.statNum} ${styles.statNumScheduled}`}>{stats.scheduled}</span>
                  <span className={styles.statLabel}>Programate</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <span className={`${styles.statNum} ${styles.statNumCompleted}`}>{stats.completed}</span>
                  <span className={styles.statLabel}>Complete</span>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.statItem}>
                  <span className={`${styles.statNum} ${styles.statNumOther}`}>{stats.other}</span>
                  <span className={styles.statLabel}>Anulate</span>
                </div>
              </div>

              <div className={styles.list}>
                {dayAppointments.length === 0 ? (
                  <div className={styles.emptyDay}>
                    <span className={styles.emptyDayEmoji}>🗓</span>
                    <p className={styles.emptyDayText}>Nicio programare in aceasta zi</p>
                    <button className={styles.emptyDayBtn} onClick={onCreateClick}>
                      + Adauga programare
                    </button>
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
