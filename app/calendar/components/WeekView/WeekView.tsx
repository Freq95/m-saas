'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { format, isSameDay, isToday } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from '../../page.module.css';
import type { Appointment, AvailabilityBlock } from '../../hooks/useCalendar';
import { AppointmentBlock } from './AppointmentBlock';

type SlotMinute = 0 | 15 | 30 | 45;
type SlotIntervalMinutes = 15 | 30 | 60;
type TouchListLike = {
  length: number;
  [index: number]: { clientX: number; clientY: number };
};

interface WeekViewProps {
  weekDays: Date[];
  hours: number[];
  appointments: Appointment[];
  availabilityBlocks?: AvailabilityBlock[];
  viewerUserId: number | null;
  selectedDay?: Date | null;
  calendarColumns?: Array<{
    id: number;
    name: string;
    color?: string | null;
    ownerUserId?: number;
  }>;
  onSlotClick: (day: Date, hour: number, minute?: SlotMinute, context?: { calendarId?: number }) => void;
  onDayHeaderClick?: (day: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onAvailabilityBlockClick?: (block: AvailabilityBlock) => void;
  draggedAppointment?: Appointment | null;
  onDragStart?: (appointment: Appointment, day: Date) => void;
  onDragEnd?: () => void;
  onDrop?: (day: Date, hour: number, minute?: SlotMinute, context?: { calendarId?: number }) => void;
  enableDragDrop?: boolean;
  hoveredAppointmentId?: number | null;
  compact?: boolean;
  slotIntervalMinutes?: SlotIntervalMinutes;
  hourHeightPx?: number;
  minHourHeightPx?: number;
  maxHourHeightPx?: number;
  onHourHeightChange?: (heightPx: number) => void;
  autoScrollToNow?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function distanceBetweenTouches(touches: TouchListLike): number {
  if (touches.length < 2) return 0;
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY
  );
}

function midpointY(touches: TouchListLike): number {
  if (touches.length < 2) return 0;
  return (touches[0].clientY + touches[1].clientY) / 2;
}

type CalendarPositionItem =
  | {
      key: string;
      kind: 'appointment';
      appointment: Appointment;
      start: Date;
      end: Date;
    }
  | {
      key: string;
      kind: 'block';
      block: AvailabilityBlock;
      start: Date;
      end: Date;
    };

function calculateCalendarItemPositions(dayAppointments: Appointment[], dayBlocks: AvailabilityBlock[]) {
  if (dayAppointments.length === 0 && dayBlocks.length === 0) return [];

  const itemsWithDates: CalendarPositionItem[] = [
    ...dayAppointments.map((apt) => ({
      key: `appointment-${apt.id}`,
      kind: 'appointment' as const,
      appointment: apt,
      start: new Date(apt.start_time),
      end: new Date(apt.end_time),
    })),
    ...dayBlocks.map((block) => ({
      key: `block-${block.id}`,
      kind: 'block' as const,
      block,
      start: new Date(block.start_time),
      end: new Date(block.end_time),
    })),
  ]
    .filter((item) => !Number.isNaN(item.start.getTime()) && !Number.isNaN(item.end.getTime()) && item.start < item.end)
    .sort((a, b) => {
      if (a.start.getTime() !== b.start.getTime()) return a.start.getTime() - b.start.getTime();
      return a.end.getTime() - b.end.getTime();
    });

  const groups: Array<typeof itemsWithDates> = [];
  const processed = new Set<string>();

  itemsWithDates.forEach((item) => {
    if (processed.has(item.key)) return;
    const group: typeof itemsWithDates = [];
    const toProcess = [item];
    processed.add(item.key);

    while (toProcess.length > 0) {
      const current = toProcess.pop()!;
      group.push(current);

      itemsWithDates.forEach((other) => {
        if (processed.has(other.key)) return;
        if (current.start < other.end && current.end > other.start) {
          toProcess.push(other);
          processed.add(other.key);
        }
      });
    }

    if (group.length > 0) groups.push(group);
  });

  const positions: Array<{ item: CalendarPositionItem; left: number; width: number }> = [];
  groups.forEach((group) => {
    const lanes: Array<Array<typeof itemsWithDates[0]>> = [];

    group.forEach((item) => {
      let assignedLane = -1;
      for (let i = 0; i < lanes.length; i++) {
        if (!lanes[i].some((l) => item.start < l.end && item.end > l.start)) {
          assignedLane = i;
          break;
        }
      }

      if (assignedLane === -1) {
        assignedLane = lanes.length;
        lanes.push([]);
      }

      lanes[assignedLane].push(item);
    });

    const totalLanes = lanes.length;
    group.forEach((item) => {
      const laneIndex = lanes.findIndex((lane) => lane.some((l) => l.key === item.key));
      if (laneIndex !== -1) {
        positions.push({
          item,
          left: laneIndex * (100 / totalLanes),
          width: 100 / totalLanes,
        });
      }
    });
  });

  return positions;
}

function getDayBounds(day: Date, firstHour: number, lastHour: number) {
  const start = new Date(day);
  start.setHours(firstHour, 0, 0, 0);
  const end = new Date(day);
  end.setHours(lastHour + 1, 0, 0, 0);
  return { start, end };
}

function overlapsRange(startIso: string, endIso: string, rangeStart: Date, rangeEnd: Date) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return start < rangeEnd && end > rangeStart;
}

export function WeekView({
  weekDays,
  hours,
  appointments,
  availabilityBlocks = [],
  viewerUserId,
  selectedDay = null,
  calendarColumns = [],
  onSlotClick,
  onDayHeaderClick,
  onAppointmentClick,
  onAvailabilityBlockClick,
  draggedAppointment = null,
  onDragStart,
  onDragEnd,
  onDrop,
  enableDragDrop = false,
  hoveredAppointmentId = null,
  compact = false,
  slotIntervalMinutes = 15,
  hourHeightPx,
  minHourHeightPx = compact ? 48 : 40,
  maxHourHeightPx = compact ? 96 : 120,
  onHourHeightChange,
  autoScrollToNow = true,
}: WeekViewProps) {
  const SLOT_HEIGHT = clamp(hourHeightPx ?? (compact ? 60 : 96), minHourHeightPx, maxHourHeightPx);
  const columnHeightPx = hours.length * SLOT_HEIGHT;
  const slotsPerHour = 60 / slotIntervalMinutes;
  const slotHeightPx = SLOT_HEIGHT / slotsPerHour;
  const visibleSlots = hours.flatMap((hour) =>
    Array.from({ length: slotsPerHour }, (_, index) => ({
      hour,
      minute: (index * slotIntervalMinutes) as SlotMinute,
    }))
  );
  const CURRENT_TIME_EDGE_PADDING = compact ? 10 : 18;
  const gutterWidth = compact ? '44px' : '56px';
  const visibleCalendarColumns = calendarColumns.length > 1 ? calendarColumns : [];
  const columnsPerDay = Math.max(1, visibleCalendarColumns.length);
  const gridTemplateColumns = `${gutterWidth} repeat(${weekDays.length * columnsPerDay}, minmax(0, 1fr))`;

  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [currentTimeTopPx, setCurrentTimeTopPx] = useState<number | null>(null);
  const [currentTimeLabel, setCurrentTimeLabel] = useState('');
  const [isDensityDragging, setIsDensityDragging] = useState(false);
  const weekGridRef = useRef<HTMLDivElement>(null);
  const weekBodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dragScrollRafRef = useRef<number | null>(null);
  const previousSlotHeightRef = useRef(SLOT_HEIGHT);
  const hasAutoScrolledToNowRef = useRef(false);
  const densityDragRef = useRef<{
    startY: number;
    startHeight: number;
    anchorMinutes: number;
    anchorOffsetPx: number;
  } | null>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startHeight: number;
    anchorMinutes: number;
    anchorOffsetPx: number;
  } | null>(null);
  const todayIsVisible = weekDays.some((day) => isToday(day));

  const getScrollAnchor = (clientY: number) => {
    const body = weekBodyRef.current;
    if (!body) {
      return { anchorMinutes: 0, anchorOffsetPx: 0 };
    }
    const rect = body.getBoundingClientRect();
    const anchorOffsetPx = clamp(clientY - rect.top, 0, body.clientHeight);
    const anchorMinutes = ((body.scrollTop + anchorOffsetPx) / SLOT_HEIGHT) * 60;
    return { anchorMinutes, anchorOffsetPx };
  };

  const restoreScrollAnchor = (anchorMinutes: number, anchorOffsetPx: number, nextHourHeight: number) => {
    const body = weekBodyRef.current;
    if (!body) return;
    requestAnimationFrame(() => {
      body.scrollTop = Math.max(0, (anchorMinutes / 60) * nextHourHeight - anchorOffsetPx);
    });
  };

  const applyHourHeight = (nextHeight: number, anchorMinutes: number, anchorOffsetPx: number) => {
    if (!onHourHeightChange) return;
    const next = clamp(nextHeight, minHourHeightPx, maxHourHeightPx);
    onHourHeightChange(next);
    restoreScrollAnchor(anchorMinutes, anchorOffsetPx, next);
  };

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
    // Current-time indicator only displays HH:mm precision; 60s is enough.
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, [hours, columnHeightPx]);

  useEffect(() => {
    hasAutoScrolledToNowRef.current = false;
  }, [weekDays.length, weekDays[0]?.toISOString()]);

  useLayoutEffect(() => {
    const body = weekBodyRef.current;
    const previousSlotHeight = previousSlotHeightRef.current;
    if (body && previousSlotHeight > 0 && previousSlotHeight !== SLOT_HEIGHT) {
      body.scrollTop = (body.scrollTop / previousSlotHeight) * SLOT_HEIGHT;
    }
    previousSlotHeightRef.current = SLOT_HEIGHT;
  }, [SLOT_HEIGHT]);

  useEffect(() => {
    if (!autoScrollToNow) return;
    if (hasAutoScrolledToNowRef.current) return;
    if (!todayIsVisible || currentTimeTopPx === null) return;
    const el = weekBodyRef.current;
    if (!el) return;
    const targetScroll = Math.max(0, currentTimeTopPx - el.clientHeight / 2);
    el.scrollTo({ top: targetScroll, behavior: 'auto' });
    hasAutoScrolledToNowRef.current = true;
  }, [autoScrollToNow, todayIsVisible, currentTimeTopPx]);

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

  useEffect(() => {
    if (!isDensityDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = densityDragRef.current;
      if (!drag) return;
      const deltaY = event.clientY - drag.startY;
      applyHourHeight(
        drag.startHeight + deltaY * 0.45,
        drag.anchorMinutes,
        drag.anchorOffsetPx
      );
    };

    const handlePointerUp = () => {
      densityDragRef.current = null;
      setIsDensityDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
    window.addEventListener('pointercancel', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDensityDragging, maxHourHeightPx, minHourHeightPx, onHourHeightChange]);

  useEffect(() => {
    const grid = weekGridRef.current;
    if (!grid || !compact || !onHourHeightChange) return;

    const preventBrowserPinch = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        event.preventDefault();
      }
    };

    grid.addEventListener('touchstart', preventBrowserPinch, { passive: false });
    grid.addEventListener('touchmove', preventBrowserPinch, { passive: false });
    return () => {
      grid.removeEventListener('touchstart', preventBrowserPinch);
      grid.removeEventListener('touchmove', preventBrowserPinch);
    };
  }, [compact, onHourHeightChange]);

  const handleGutterPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (compact || !onHourHeightChange || event.button !== 0) return;
    const anchor = getScrollAnchor(event.clientY);
    densityDragRef.current = {
      startY: event.clientY,
      startHeight: SLOT_HEIGHT,
      ...anchor,
    };
    setIsDensityDragging(true);
    event.preventDefault();
  };

  const handleGridTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!compact || !onHourHeightChange || event.touches.length !== 2) return;
    const centerY = midpointY(event.touches);
    const anchor = getScrollAnchor(centerY);
    pinchRef.current = {
      startDistance: distanceBetweenTouches(event.touches),
      startHeight: SLOT_HEIGHT,
      ...anchor,
    };
  };

  const handleGridTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const pinch = pinchRef.current;
    if (!pinch || event.touches.length !== 2) return;
    const nextDistance = distanceBetweenTouches(event.touches);
    if (pinch.startDistance <= 0 || nextDistance <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    applyHourHeight(
      pinch.startHeight * (nextDistance / pinch.startDistance),
      pinch.anchorMinutes,
      pinch.anchorOffsetPx
    );
  };

  const handleGridTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) {
      pinchRef.current = null;
    }
  };

  const getAppointmentsForDay = (day: Date, calendarId?: number) =>
    appointments.filter((apt) => (
      isSameDay(new Date(apt.start_time), day) &&
      (typeof calendarId !== 'number' || apt.calendar_id === calendarId)
    ));

  const getAvailabilityBlocksForDay = (day: Date, calendarId?: number) => {
    const { start, end } = getDayBounds(day, hours[0], hours[hours.length - 1]);
    return availabilityBlocks.filter((block) => (
      overlapsRange(block.start_time, block.end_time, start, end) &&
      (
        typeof calendarId !== 'number' ||
        block.visible_calendar_ids?.includes(calendarId) ||
        block.calendar_id === calendarId
      )
    ));
  };

  // Precompute lane positions once per appointments/weekDays change.
  // Previously this O(n²) overlap calc ran inside the render loop on every render
  // (incl. drag-over, hover, time-tick), even when appointments didn't change.
  const positionsByDayAndCalendar = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateCalendarItemPositions>>();
    const cols = visibleCalendarColumns.length > 0
      ? visibleCalendarColumns
      : [{ id: undefined as number | undefined }];
    for (const day of weekDays) {
      for (const col of cols) {
        const key = `${day.toISOString()}-${col.id ?? 'day'}`;
        map.set(key, calculateCalendarItemPositions(
          getAppointmentsForDay(day, col.id),
          getAvailabilityBlocksForDay(day, col.id)
        ));
      }
    }
    return map;
    // getAppointmentsForDay is a stable closure over `appointments`; including it
    // would be redundant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, availabilityBlocks, weekDays, visibleCalendarColumns, hours]);

  const showCurrentTimeLine = currentTimeTopPx !== null;
  const showCurrentTimeGutter = todayIsVisible && currentTimeTopPx !== null;
  const isNearTopEdge = currentTimeTopPx !== null && currentTimeTopPx <= 26;
  const isNearBottomEdge = currentTimeTopPx !== null && currentTimeTopPx >= columnHeightPx - 26;

  return (
    <div
      ref={weekGridRef}
      className={styles.weekGrid}
      onTouchStart={handleGridTouchStart}
      onTouchMove={handleGridTouchMove}
      onTouchEnd={handleGridTouchEnd}
      onTouchCancel={() => {
        pinchRef.current = null;
      }}
    >
      <div ref={headerRef} className={styles.weekHeaderRow} style={{ gridTemplateColumns }}>
        <div className={styles.weekCorner} />
        {weekDays.map((day) => {
          const todayFlag = isToday(day);
          const selectedFlag = selectedDay ? isSameDay(day, selectedDay) : false;
          return (
            <div
              key={day.toISOString()}
              className={`${styles.weekDayHeader}${selectedFlag ? ` ${styles.isSelectedDay}` : ''}${visibleCalendarColumns.length > 0 ? ` ${styles.weekDayHeaderMulti}` : ''}`}
              style={visibleCalendarColumns.length > 0 ? { gridColumn: `span ${visibleCalendarColumns.length}` } : undefined}
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
              {visibleCalendarColumns.length > 0 && (
                <div
                  className={styles.weekCalendarHeaderGrid}
                  style={{ gridTemplateColumns: `repeat(${visibleCalendarColumns.length}, minmax(0, 1fr))` }}
                >
                  {visibleCalendarColumns.map((calendar) => (
                    <span
                      key={calendar.id}
                      className={styles.weekCalendarHeaderCell}
                      title={calendar.name}
                      aria-label={calendar.name}
                    >
                      <span
                        className={styles.weekCalendarHeaderDot}
                        style={{ background: calendar.color || 'var(--color-accent)' }}
                        aria-hidden="true"
                      />
                      <span title={calendar.name}>{calendar.name}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.weekBody} ref={weekBodyRef} style={{ gridTemplateColumns }}>
        <div
          className={`${styles.timeGutter}${!compact && onHourHeightChange ? ` ${styles.timeGutterResizable}` : ''}`}
          onPointerDown={handleGutterPointerDown}
          title={!compact && onHourHeightChange ? 'Trage în sus sau jos pentru densitatea calendarului' : undefined}
        >
          {visibleSlots.map(({ hour, minute }) => (
            <div key={`${hour}:${minute}`} className={styles.timeSlot} style={{ height: `${slotHeightPx}px` }}>
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

        {weekDays.flatMap((day) => {
          const columns = visibleCalendarColumns.length > 0
            ? visibleCalendarColumns
            : [{ id: undefined, name: '', color: null, ownerUserId: undefined }];

          return columns.map((calendar) => {
            const slotContext = typeof calendar.id === 'number' ? { calendarId: calendar.id } : undefined;
            const calendarItemPositions = positionsByDayAndCalendar.get(`${day.toISOString()}-${calendar.id ?? 'day'}`) ?? [];
            const todayFlag = isToday(day);

            const { start: dayStart, end: dayEnd } = getDayBounds(day, hours[0], hours[hours.length - 1]);
            const dayDuration = dayEnd.getTime() - dayStart.getTime();

            return (
              <div
                key={`${day.toISOString()}-${calendar.id ?? 'day'}`}
                className={`${styles.weekDayColumn}${todayFlag ? ` ${styles.isToday}` : ''}`}
                style={{ height: `${columnHeightPx}px` }}
              >
                {visibleSlots.map(({ hour, minute }) => {
                  const slotKey = `${day.toISOString()}-${calendar.id ?? 'day'}-${hour}:${minute}`;
                  return (
                    <div
                      key={`${hour}:${minute}`}
                      className={`${styles.slot}${dragOverSlot === slotKey ? ` ${styles.dragOver}` : ''}`}
                      style={{ height: `${slotHeightPx}px` }}
                      onClick={() => onSlotClick(day, hour, minute, slotContext)}
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
                        } else {
                          cancelDragScroll();
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
                        onDrop(day, hour, minute, slotContext);
                      }}
                      aria-hidden="true"
                    />
                  );
                })}

                {calendarItemPositions.map(({ item, left, width }) => {
                  if (item.kind === 'appointment') {
                    const apt = item.appointment;
                    const aptStart = item.start.getTime();
                    const aptEnd = item.end.getTime();
                    const topPercent = ((aptStart - dayStart.getTime()) / dayDuration) * 100;
                    const naturalHeightPercent = ((aptEnd - aptStart) / dayDuration) * 100;
                    const halfSlotPercent = (SLOT_HEIGHT / 2 / columnHeightPx) * 100;
                    const durationMinutes = (aptEnd - aptStart) / 60_000;
                    const isCompact = durationMinutes < 30;
                    const isNarrow = width < 56;
                    const finalHeightPercent = isCompact
                      ? naturalHeightPercent
                      : Math.max(naturalHeightPercent, halfSlotPercent);

                    return (
                      <AppointmentBlock
                        key={item.key}
                        appointment={apt}
                        viewerUserId={viewerUserId}
                        style={{
                          top: `calc(${topPercent}% + 2px)`,
                          left: `${left}%`,
                          width: `${width}%`,
                          height: `calc(${finalHeightPercent}% - 4px)`,
                        }}
                        compact={isCompact}
                        narrow={isNarrow}
                        phoneView={compact}
                        onClick={onAppointmentClick}
                        enableDragDrop={enableDragDrop}
                        onDragStart={onDragStart ? (a) => onDragStart(a, day) : undefined}
                        onDragEnd={onDragEnd}
                        isDragging={draggedAppointment?.id === apt.id}
                        isHighlighted={hoveredAppointmentId === apt.id}
                      />
                    );
                  }

                  const block = item.block;
                  const blockStart = Math.max(item.start.getTime(), dayStart.getTime());
                  const blockEnd = Math.min(item.end.getTime(), dayEnd.getTime());
                  const topPercent = ((blockStart - dayStart.getTime()) / dayDuration) * 100;
                  const naturalHeightPercent = ((blockEnd - blockStart) / dayDuration) * 100;
                  const minHeightPercent = (Math.max(20, SLOT_HEIGHT / 3) / columnHeightPx) * 100;
                  const finalHeightPercent = Math.max(naturalHeightPercent, minHeightPercent);
                  const compactBlock = naturalHeightPercent < minHeightPercent * 1.4 || width < 56;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`${styles.availabilityBlock}${compactBlock ? ` ${styles.availabilityBlockCompact}` : ''}`}
                      style={{
                        top: `calc(${topPercent}% + 2px)`,
                        left: `calc(${left}% + 4px)`,
                        width: `calc(${width}% - 8px)`,
                        height: `calc(${finalHeightPercent}% - 4px)`,
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        onAvailabilityBlockClick?.(block);
                      }}
                      title={`${block.type_label}${block.reason ? ` - ${block.reason}` : ''}`}
                      aria-label={`Blocaj ${block.type_label}`}
                    >
                      <span className={styles.availabilityBlockTitle}>{block.type_label}</span>
                      {!compactBlock && block.reason && (
                        <span className={styles.availabilityBlockReason}>{block.reason}</span>
                      )}
                    </button>
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
          });
        })}
      </div>
    </div>
  );
}
