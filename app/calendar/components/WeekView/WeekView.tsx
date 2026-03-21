'use client';

import { useState, useEffect, useRef } from 'react';
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
  onSlotClick: (day: Date, hour: number, minute?: 0 | 15 | 30 | 45) => void;
  onDayHeaderClick?: (day: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  draggedAppointment?: Appointment | null;
  onDragStart?: (appointment: Appointment, day: Date) => void;
  onDragEnd?: () => void;
  onDrop?: (day: Date, hour: number, minute?: 0 | 15 | 30 | 45) => void;
  enableDragDrop?: boolean;
  hoveredAppointmentId?: number | null;
  providers?: Provider[];
}

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

      if (assignedLane === -1) {
        assignedLane = lanes.length;
        lanes.push([]);
      }

      lanes[assignedLane].push(apt);
    });

    const totalLanes = lanes.length;
    group.forEach((apt) => {
      const laneIndex = lanes.findIndex((lane) => lane.some((l) => l.id === apt.id));
      if (laneIndex !== -1) {
        positions.push({
          apt: apt.original,
          left: laneIndex * (100 / totalLanes),
          width: 100 / totalLanes,
        });
      }
    });
  });

  return positions;
}

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
  hoveredAppointmentId = null,
  providers = [],
}: WeekViewProps) {
  const SLOT_HEIGHT = 96;
  const columnHeightPx = hours.length * SLOT_HEIGHT;
  const quarterHourSlots = hours.flatMap((hour) => [
    { hour, minute: 0 as 0 | 15 | 30 | 45 },
    { hour, minute: 15 as 0 | 15 | 30 | 45 },
    { hour, minute: 30 as 0 | 15 | 30 | 45 },
    { hour, minute: 45 as 0 | 15 | 30 | 45 },
  ]);
  const CURRENT_TIME_EDGE_PADDING = 18;
  const gridTemplateColumns = `56px repeat(${weekDays.length}, minmax(0, 1fr))`;

  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [currentTimeTopPx, setCurrentTimeTopPx] = useState<number | null>(null);
  const [currentTimeLabel, setCurrentTimeLabel] = useState('');
  const weekBodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dragScrollRafRef = useRef<number | null>(null);
  const todayIsVisible = weekDays.some((day) => isToday(day));

  const cancelDragScroll = () => {
    if (dragScrollRafRef.current !== null) {
      cancelAnimationFrame(dragScrollRafRef.current);
      dragScrollRafRef.current = null;
    }
  };

  const startDragScroll = (direction: 'up' | 'down', speed: number) => {
    cancelDragScroll();
    const tick = () => {
      const el = weekBodyRef.current;
      if (!el) return;
      el.scrollTop += direction === 'down' ? speed : -speed;
      dragScrollRafRef.current = requestAnimationFrame(tick);
    };
    dragScrollRafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const startHour = hours[0];
      const endHour = hours[hours.length - 1] + 1;
      const currentMin = (now.getHours() - startHour) * 60 + now.getMinutes();
      const totalMin = (endHour - startHour) * 60;

      if (currentMin < 0 || currentMin > totalMin) {
        setCurrentTimeTopPx(null);
        return;
      }

      const rawTopPx = (currentMin / totalMin) * columnHeightPx;
      const clampedTopPx = Math.min(
        Math.max(rawTopPx, CURRENT_TIME_EDGE_PADDING),
        columnHeightPx - CURRENT_TIME_EDGE_PADDING
      );
      setCurrentTimeTopPx(clampedTopPx);
      setCurrentTimeLabel(format(now, 'HH:mm'));
    };

    compute();
    const id = setInterval(compute, 30_000);
    return () => clearInterval(id);
  }, [hours, columnHeightPx]);

  useEffect(() => {
    if (!todayIsVisible || currentTimeTopPx === null) return;
    const el = weekBodyRef.current;
    if (!el) return;
    const targetScroll = Math.max(0, currentTimeTopPx - el.clientHeight / 2);
    el.scrollTo({ top: targetScroll, behavior: 'auto' });
  }, [todayIsVisible, currentTimeTopPx]);

  // Compensate header width for the body's scrollbar so column lines align
  useEffect(() => {
    const syncGutter = () => {
      const body = weekBodyRef.current;
      const header = headerRef.current;
      if (!body || !header) return;
      const scrollbarWidth = body.offsetWidth - body.clientWidth;
      header.style.paddingRight = `${scrollbarWidth}px`;
    };
    syncGutter();
    window.addEventListener('resize', syncGutter);
    return () => window.removeEventListener('resize', syncGutter);
  }, []);

  // Cancel auto-scroll when drag ends
  useEffect(() => {
    if (!draggedAppointment) {
      cancelDragScroll();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggedAppointment]);

  const getAppointmentsForDay = (day: Date) =>
    appointments.filter((apt) => isSameDay(new Date(apt.start_time), day));

  const getBlockedTimesForDay = (day: Date) =>
    blockedTimes.filter((bt) => isSameDay(new Date(bt.start_time), day));

  const showCurrentTimeLine = currentTimeTopPx !== null;
  const showCurrentTimeGutter = todayIsVisible && currentTimeTopPx !== null;
  const isNearTopEdge = currentTimeTopPx !== null && currentTimeTopPx <= 26;
  const isNearBottomEdge = currentTimeTopPx !== null && currentTimeTopPx >= columnHeightPx - 26;

  return (
    <div className={styles.weekGrid}>
      <div ref={headerRef} className={styles.weekHeaderRow} style={{ gridTemplateColumns }}>
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
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onDayHeaderClick?.(day);
              }}
            >
              <div className={styles.dayName}>{format(day, 'EEE', { locale: ro })}</div>
              <div className={`${styles.dayNumber}${todayFlag ? ` ${styles.isToday}` : ''}`}>{format(day, 'd')}</div>
            </div>
          );
        })}
      </div>

      <div className={styles.weekBody} ref={weekBodyRef} style={{ gridTemplateColumns }}>
        <div className={styles.timeGutter}>
          {quarterHourSlots.map(({ hour, minute }) => (
            <div key={`${hour}:${minute}`} className={styles.timeSlot} style={{ height: `${SLOT_HEIGHT / 4}px` }}>
              {minute === 0 ? `${String(hour).padStart(2, '0')}:00` : ''}
            </div>
          ))}

          {showCurrentTimeGutter && (
            <div
              className={`${styles.currentTimeGutterIndicator}${isNearTopEdge ? ` ${styles.isNearTop}` : ''}${isNearBottomEdge ? ` ${styles.isNearBottom}` : ''}`}
              style={{ top: `${currentTimeTopPx}px` }}
            >
              <span className={styles.currentTimeGutterLabel}>{currentTimeLabel}</span>
              <span className={styles.currentTimeGutterTick} />
            </div>
          )}
        </div>

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
              style={{ height: `${columnHeightPx}px` }}
            >
              {quarterHourSlots.map(({ hour, minute }) => {
                const slotKey = `${day.toISOString()}-${hour}:${minute}`;
                return (
                  <div
                    key={`${hour}:${minute}`}
                    className={`${styles.slot}${dragOverSlot === slotKey ? ` ${styles.dragOver}` : ''}`}
                    style={{ height: `${SLOT_HEIGHT / 4}px` }}
                    onClick={() => onSlotClick(day, hour, minute)}
                    onDragOver={(e) => {
                      if (!enableDragDrop) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverSlot(slotKey);

                      // Auto-scroll when cursor is near top/bottom edge
                      const container = weekBodyRef.current;
                      if (container) {
                        const rect = container.getBoundingClientRect();
                        const ZONE = 80; // px from edge that triggers scroll
                        const MAX_SPEED = 12;
                        const y = e.clientY;
                        if (y < rect.top + ZONE) {
                          startDragScroll('up', Math.max(2, MAX_SPEED * (1 - (y - rect.top) / ZONE)));
                        } else if (y > rect.bottom - ZONE) {
                          startDragScroll('down', Math.max(2, MAX_SPEED * (1 - (rect.bottom - y) / ZONE)));
                        } else {
                          cancelDragScroll();
                        }
                      }
                    }}
                    onDragLeave={() => {
                      if (!enableDragDrop) return;
                      setDragOverSlot(null);
                    }}
                    onDrop={(e) => {
                      if (!enableDragDrop || !onDrop) return;
                      e.preventDefault();
                      cancelDragScroll();
                      setDragOverSlot(null);
                      onDrop(day, hour, minute);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Creeaza programare ${format(day, 'd MMM', { locale: ro })} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSlotClick(day, hour, minute);
                      }
                    }}
                  />
                );
              })}

              {appointmentPositions.map(({ apt, left, width }) => {
                const aptStart = new Date(apt.start_time).getTime();
                const aptEnd = new Date(apt.end_time).getTime();
                const topPercent = ((aptStart - dayStart.getTime()) / dayDuration) * 100;
                const naturalHeightPercent = ((aptEnd - aptStart) / dayDuration) * 100;
                const halfSlotPercent = (SLOT_HEIGHT / 2 / columnHeightPx) * 100;
                const isCompact = naturalHeightPercent < halfSlotPercent;
                const finalHeightPercent = isCompact
                  ? naturalHeightPercent
                  : Math.max(naturalHeightPercent, halfSlotPercent);

                return (
                  <AppointmentBlock
                    key={apt.id}
                    appointment={apt}
                    style={{
                      top: `calc(${topPercent}% + 2px)`,
                      left: `${left}%`,
                      width: `${width}%`,
                      height: `calc(${finalHeightPercent}% - 4px)`,
                    }}
                    compact={isCompact}
                    onClick={onAppointmentClick}
                    enableDragDrop={enableDragDrop}
                    onDragStart={onDragStart ? (a) => onDragStart(a, day) : undefined}
                    onDragEnd={onDragEnd}
                    isDragging={draggedAppointment?.id === apt.id}
                    isHighlighted={hoveredAppointmentId === apt.id}
                    providers={providers}
                  />
                );
              })}

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

              {showCurrentTimeLine && (
                todayFlag ? (
                  <div className={styles.currentTimeLine} style={{ top: `${currentTimeTopPx}px` }}>
                    <span className={styles.currentTimeDot} />
                  </div>
                ) : (
                  <div className={styles.currentTimeLineDashed} style={{ top: `${currentTimeTopPx}px` }} />
                )
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

