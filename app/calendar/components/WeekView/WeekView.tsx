'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from '../../page.module.css';
import type { Appointment, Provider } from '../../hooks/useCalendar';
import { AppointmentBlock } from './AppointmentBlock';
import { BlockedTimeBlock } from './BlockedTimeBlock';

interface BlockedTime {
  id: number;
  provider_id?: number;
  resource_id?: number;
  start_time: string;
  end_time: string;
  reason: string;
  is_recurring: boolean;
}

interface WeekViewProps {
  weekDays: Date[];
  hours: number[];
  appointments: Appointment[];
  blockedTimes?: BlockedTime[];
  selectedDay?: Date | null;
  onSlotClick: (day: Date, hour: number) => void;
  onDayHeaderClick?: (day: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  draggedAppointment?: Appointment | null;
  onDragStart?: (appointment: Appointment, day: Date) => void;
  onDragEnd?: () => void;
  onDrop?: (day: Date, hour: number) => void;
  enableDragDrop?: boolean;
  providers?: Provider[];
}

// ── Lane-based conflict layout (unchanged from before) ──────────────────────
function calculateAppointmentPositions(dayAppointments: Appointment[]) {
  if (dayAppointments.length === 0) return [];

  const aptsWithDates = dayAppointments
    .map((apt) => ({
      ...apt,
      start: new Date(apt.start_time),
      end: new Date(apt.end_time),
      original: apt,
    }))
    .sort((a, b) => {
      if (a.start.getTime() !== b.start.getTime()) return a.start.getTime() - b.start.getTime();
      return a.end.getTime() - b.end.getTime();
    });

  const groups: Array<typeof aptsWithDates> = [];
  const processed = new Set<number>();

  aptsWithDates.forEach((apt) => {
    if (processed.has(apt.id)) return;
    const group: typeof aptsWithDates = [];
    const toProcess = [apt];
    processed.add(apt.id);
    while (toProcess.length > 0) {
      const current = toProcess.pop()!;
      group.push(current);
      aptsWithDates.forEach((other) => {
        if (processed.has(other.id)) return;
        if (current.start < other.end && current.end > other.start) {
          toProcess.push(other);
          processed.add(other.id);
        }
      });
    }
    if (group.length > 0) groups.push(group);
  });

  const positions: Array<{ apt: Appointment; left: number; width: number }> = [];
  groups.forEach((group) => {
    const lanes: Array<Array<typeof aptsWithDates[0]>> = [];
    group.forEach((apt) => {
      let assignedLane = -1;
      for (let i = 0; i < lanes.length; i++) {
        if (!lanes[i].some((l) => apt.start < l.end && apt.end > l.start)) {
          assignedLane = i;
          break;
        }
      }
      if (assignedLane === -1) { assignedLane = lanes.length; lanes.push([]); }
      lanes[assignedLane].push(apt);
    });
    const totalLanes = lanes.length;
    group.forEach((apt) => {
      const laneIndex = lanes.findIndex((lane) => lane.some((l) => l.id === apt.id));
      if (laneIndex !== -1) {
        positions.push({ apt: apt.original, left: laneIndex * (100 / totalLanes), width: 100 / totalLanes });
      }
    });
  });
  return positions;
}

// ── Current-time line inside today's column ──────────────────────────────────
function CurrentTimeLine({ hours, slotHeight }: { hours: number[]; slotHeight: number }) {
  const [topPx, setTopPx] = useState<number | null>(null);

  const compute = useCallback(() => {
    const now = new Date();
    const startHour = hours[0];
    const endHour = hours[hours.length - 1] + 1;
    const currentMin = (now.getHours() - startHour) * 60 + now.getMinutes();
    const totalMin = (endHour - startHour) * 60;
    if (currentMin < 0 || currentMin > totalMin) { setTopPx(null); return; }
    setTopPx((currentMin / totalMin) * hours.length * slotHeight);
  }, [hours, slotHeight]);

  useEffect(() => {
    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, [compute]);

  if (topPx === null) return null;
  return <div className={styles.currentTimeLine} style={{ top: topPx }} />;
}

// ── Main component ────────────────────────────────────────────────────────────
export function WeekView({
  weekDays,
  hours,
  appointments,
  blockedTimes = [],
  selectedDay = null,
  onSlotClick,
  onDayHeaderClick,
  onAppointmentClick,
  draggedAppointment = null,
  onDragStart,
  onDragEnd,
  onDrop,
  enableDragDrop = false,
  providers = [],
}: WeekViewProps) {
  const SLOT_HEIGHT = 64; // px — must match .timeSlot height in CSS
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const weekBodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current time on mount
  useEffect(() => {
    const el = weekBodyRef.current;
    if (!el) return;
    const now = new Date();
    const startHour = hours[0];
    const currentMin = (now.getHours() - startHour) * 60 + now.getMinutes();
    if (currentMin <= 0) return;
    const totalMin = hours.length * 60;
    const scrollFraction = currentMin / totalMin;
    const targetScroll = scrollFraction * el.scrollHeight - el.clientHeight / 2;
    el.scrollTop = Math.max(0, targetScroll);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getAppointmentsForDay = (day: Date) =>
    appointments.filter((apt) => isSameDay(new Date(apt.start_time), day));

  const getBlockedTimesForDay = (day: Date) =>
    blockedTimes.filter((bt) => isSameDay(new Date(bt.start_time), day));

  return (
    <div className={styles.weekGrid}>

      {/* ── Header row ── */}
      <div className={styles.weekHeaderRow}>
        <div className={styles.weekCorner} />
        {weekDays.map((day) => {
          const todayFlag = isToday(day);
          const selectedFlag = selectedDay ? isSameDay(day, selectedDay) : false;
          return (
            <div
              key={day.toISOString()}
              className={`${styles.weekDayHeader}${selectedFlag ? ` ${styles.isSelectedDay}` : ''}`}
              onClick={() => onDayHeaderClick?.(day)}
              role="button"
              tabIndex={0}
              aria-label={format(day, 'd MMMM', { locale: ro })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onDayHeaderClick?.(day); }}
            >
              <div className={styles.dayName}>{format(day, 'EEE', { locale: ro })}</div>
              <div className={`${styles.dayNumber}${todayFlag ? ` ${styles.isToday}` : ''}`}>
                {format(day, 'd')}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Scrollable body ── */}
      <div className={styles.weekBody} ref={weekBodyRef}>

        {/* Time gutter */}
        <div className={styles.timeGutter}>
          {hours.map((hour) => (
            <div key={hour} className={styles.timeSlot}>
              {String(hour).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Day columns */}
        {weekDays.map((day) => {
          const dayAppointments = getAppointmentsForDay(day);
          const appointmentPositions = calculateAppointmentPositions(dayAppointments);
          const todayFlag = isToday(day);

          const dayStart = new Date(day);
          dayStart.setHours(hours[0], 0, 0, 0);
          const dayEnd = new Date(day);
          dayEnd.setHours(hours[hours.length - 1] + 1, 0, 0, 0);
          const dayDuration = dayEnd.getTime() - dayStart.getTime();

          return (
            <div
              key={day.toISOString()}
              className={`${styles.weekDayColumn}${todayFlag ? ` ${styles.isToday}` : ''}`}
            >
              {/* Clickable hour slots */}
              {hours.map((hour) => {
                const slotKey = `${day.toISOString()}-${hour}`;
                return (
                  <div
                    key={hour}
                    className={`${styles.slot}${dragOverSlot === slotKey ? ` ${styles.dragOver}` : ''}`}
                    onClick={() => onSlotClick(day, hour)}
                    onDragOver={(e) => {
                      if (!enableDragDrop) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverSlot(slotKey);
                    }}
                    onDragLeave={() => enableDragDrop && setDragOverSlot(null)}
                    onDrop={(e) => {
                      if (!enableDragDrop || !onDrop) return;
                      e.preventDefault();
                      setDragOverSlot(null);
                      onDrop(day, hour);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Creeaza programare ${format(day, 'd MMM', { locale: ro })} ${hour}:00`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSlotClick(day, hour); }
                    }}
                  />
                );
              })}

              {/* Appointment blocks */}
              {appointmentPositions.map(({ apt, left, width }) => {
                const aptStart = new Date(apt.start_time).getTime();
                const aptEnd = new Date(apt.end_time).getTime();
                const topPercent = ((aptStart - dayStart.getTime()) / dayDuration) * 100;
                const heightPercent = ((aptEnd - aptStart) / dayDuration) * 100;
                return (
                  <AppointmentBlock
                    key={apt.id}
                    appointment={apt}
                    style={{ top: `${topPercent}%`, left: `${left}%`, width: `${width}%`, height: `${Math.max(heightPercent, 3)}%` }}
                    onClick={onAppointmentClick}
                    enableDragDrop={enableDragDrop}
                    onDragStart={onDragStart ? (a) => onDragStart(a, day) : undefined}
                    onDragEnd={onDragEnd}
                    isDragging={draggedAppointment?.id === apt.id}
                    providers={providers}
                  />
                );
              })}

              {/* Blocked time blocks */}
              {getBlockedTimesForDay(day).map((bt) => {
                const btStart = new Date(bt.start_time).getTime();
                const btEnd = new Date(bt.end_time).getTime();
                const topPercent = ((btStart - dayStart.getTime()) / dayDuration) * 100;
                const heightPercent = ((btEnd - btStart) / dayDuration) * 100;
                return (
                  <BlockedTimeBlock
                    key={bt.id}
                    blockedTime={bt}
                    style={{ top: `${topPercent}%`, left: '0%', width: '100%', height: `${heightPercent}%` }}
                  />
                );
              })}

              {/* Current time line — only in today's column */}
              {todayFlag && <CurrentTimeLine hours={hours} slotHeight={SLOT_HEIGHT} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
