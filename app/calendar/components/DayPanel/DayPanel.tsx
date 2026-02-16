'use client';

import { useMemo } from 'react';
import {
  format, isSameDay, isToday, startOfWeek, startOfMonth, endOfMonth,
  eachDayOfInterval, addDays, addMonths, subMonths, isSameMonth,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from './DayPanel.module.css';
import type { Appointment } from '../../hooks/useCalendar';

interface DayPanelProps {
  selectedDay: Date | null;
  appointments: Appointment[];
  currentDate: Date;
  onAppointmentClick: (appointment: Appointment) => void;
  onQuickStatusChange: (id: number, status: string) => void;
  onCreateClick: () => void;
  onNavigate: (date: Date) => void;
}

type PanelStatusKey = 'scheduled' | 'completed' | 'cancelled' | 'no-show';

const STATUS_CONFIG: Record<PanelStatusKey, { label: string; pillClass: string }> = {
  scheduled: { label: 'Programat', pillClass: 'statusPillScheduled' },
  completed: { label: 'Completat', pillClass: 'statusPillCompleted' },
  cancelled: { label: 'Anul.', pillClass: 'statusPillCancelled' },
  'no-show': { label: 'Absent', pillClass: 'statusPillNoShow' },
};

function normalizeStatus(status: string): PanelStatusKey {
  if (status === 'no_show' || status === 'no-show') return 'no-show';
  if (status === 'completed') return 'completed';
  if (status === 'cancelled') return 'cancelled';
  return 'scheduled';
}

function getStatusConfig(status: PanelStatusKey) {
  return STATUS_CONFIG[status];
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
  // viewMonth tracks which month the mini calendar shows; follows currentDate
  const viewMonth = currentDate;

  const days = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const weekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const lastWeekStart = startOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: addDays(lastWeekStart, 6) });
  }, [viewMonth]);

  // Count appointments per day for dot indicators
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
          ‹
        </button>
        <span className={styles.miniCalMonth}>
          {format(viewMonth, 'MMMM yyyy', { locale: ro })}
        </span>
        <button
          className={styles.miniCalNav}
          onClick={(e) => { e.stopPropagation(); onSelectDay(addMonths(viewMonth, 1)); }}
          aria-label="Luna urmatoare"
        >
          ›
        </button>
      </div>

      <div className={styles.miniCalGrid}>
        {weekLabels.map((d, i) => (
          <span key={i} className={styles.miniCalWeekLabel}>{d}</span>
        ))}
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, viewMonth);
          const isTodayFlag = isToday(day);
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
          const hasApt = aptDays.has(format(day, 'yyyy-MM-dd'));

          return (
            <button
              key={day.toISOString()}
              className={[
                styles.miniCalDay,
                !isCurrentMonth ? styles.miniCalDayOther : '',
                isTodayFlag   ? styles.miniCalDayToday    : '',
                isSelected    ? styles.miniCalDaySelected  : '',
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

// ── Card for a single appointment ─────────────────────────────────────────────
function AppointmentCard({
  appointment: apt,
  onClick,
  onStatusChange,
}: {
  appointment: Appointment;
  onClick: (a: Appointment) => void;
  onStatusChange: (id: number, status: string) => void;
}) {
  const start = new Date(apt.start_time);
  const end   = new Date(apt.end_time);
  const status = normalizeStatus(apt.status);
  const cfg = getStatusConfig(status);
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60_000);

  return (
    <div className={styles.card} onClick={() => onClick(apt)}>
      <div className={styles.colorBar} style={{ background: apt.color || 'var(--color-accent)' }} />
      <div className={styles.cardBody}>
        <div className={styles.timeRow}>
          <span className={styles.time}>
            {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
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
        {status === 'scheduled' && (
          <div className={styles.quickActions} onClick={(e) => e.stopPropagation()}>
            <button
              className={`${styles.qBtn} ${styles.qComplete}`}
              onClick={() => onStatusChange(apt.id, 'completed')}
            >
              ✓ Completat
            </button>
            <button
              className={`${styles.qBtn} ${styles.qAbsent}`}
              onClick={() => onStatusChange(apt.id, 'no-show')}
            >
              ⚠ Absent
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function DayPanel({
  selectedDay,
  appointments,
  currentDate,
  onAppointmentClick,
  onQuickStatusChange,
  onCreateClick,
  onNavigate,
}: DayPanelProps) {
  const dayAppointments = useMemo(() => {
    if (!selectedDay) return [];
    return appointments
      .filter((apt) => isSameDay(new Date(apt.start_time), selectedDay))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [selectedDay, appointments]);

  const stats = useMemo(() => ({
    total:     dayAppointments.length,
    scheduled: dayAppointments.filter((a) => normalizeStatus(a.status) === 'scheduled').length,
    completed: dayAppointments.filter((a) => normalizeStatus(a.status) === 'completed').length,
    other: dayAppointments.filter((a) => {
      const status = normalizeStatus(a.status);
      return status === 'cancelled' || status === 'no-show';
    }).length,
  }), [dayAppointments]);

  // Mini calendar day click: if in same month → select day; if different month → navigate month AND select
  const handleMiniCalDay = (day: Date) => {
    onNavigate(day);
  };

  return (
    <aside className={styles.panel}>

      {/* ── Mini calendar ── */}
      <MiniCalendar
        currentDate={currentDate}
        selectedDay={selectedDay}
        appointments={appointments}
        onSelectDay={handleMiniCalDay}
      />

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
          {/* ── Header ── */}
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

          {/* ── Stats strip ── */}
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

          {/* ── List ── */}
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
    </aside>
  );
}
