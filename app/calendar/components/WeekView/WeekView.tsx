'use client';

import { useMemo, useState } from 'react';
import { format, isSameDay } from 'date-fns';
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
  onSlotClick: (day: Date, hour: number) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  draggedAppointment?: Appointment | null;
  onDragStart?: (appointment: Appointment, day: Date) => void;
  onDragEnd?: () => void;
  onDrop?: (day: Date, hour: number) => void;
  enableDragDrop?: boolean;
  providers?: Provider[];
}

// Calculate appointment positions using lane assignment
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
      if (a.start.getTime() !== b.start.getTime()) {
        return a.start.getTime() - b.start.getTime();
      }
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

    if (group.length > 0) {
      groups.push(group);
    }
  });

  const positions: Array<{ apt: Appointment; left: number; width: number }> = [];

  groups.forEach((group) => {
    const lanes: Array<Array<typeof aptsWithDates[0]>> = [];

    group.forEach((apt) => {
      let assignedLane = -1;

      for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
        const lane = lanes[laneIndex];
        const conflicts = lane.some((laneApt) => {
          return apt.start < laneApt.end && apt.end > laneApt.start;
        });

        if (!conflicts) {
          assignedLane = laneIndex;
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
      const laneIndex = lanes.findIndex((lane) =>
        lane.some((laneApt) => laneApt.id === apt.id)
      );

      if (laneIndex !== -1) {
        const widthPercent = 100 / totalLanes;
        const leftPercent = laneIndex * widthPercent;

        positions.push({
          apt: apt.original,
          left: leftPercent,
          width: widthPercent,
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
  onSlotClick,
  onAppointmentClick,
  draggedAppointment = null,
  onDragStart,
  onDragEnd,
  onDrop,
  enableDragDrop = false,
  providers = [],
}: WeekViewProps) {
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);

  const getAppointmentsForDay = (day: Date) => {
    return appointments.filter((apt) => isSameDay(new Date(apt.start_time), day));
  };

  const getBlockedTimesForDay = (day: Date) => {
    return blockedTimes.filter((bt) => isSameDay(new Date(bt.start_time), day));
  };

  return (
    <div className={styles.calendar}>
      <div className={styles.timeColumn}>
        {hours.map((hour) => (
          <div key={hour} className={styles.timeSlot}>
            {hour}:00
          </div>
        ))}
      </div>

      {weekDays.map((day) => {
        const dayAppointments = getAppointmentsForDay(day);
        const appointmentPositions = calculateAppointmentPositions(dayAppointments);

        const dayStart = new Date(day);
        dayStart.setHours(8, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(19, 0, 0, 0);
        const dayDuration = dayEnd.getTime() - dayStart.getTime();

        return (
          <div key={day.toISOString()} className={styles.dayColumn}>
            <div className={styles.dayHeader}>
              <div className={styles.dayName}>{format(day, 'EEEE', { locale: ro })}</div>
              <div className={styles.dayNumber}>{format(day, 'd')}</div>
            </div>
            <div className={styles.daySlots}>
              {hours.map((hour) => {
                const slotKey = `${day.toISOString()}-${hour}`;
                return (
                  <div
                    key={hour}
                    className={`${styles.slot} ${dragOverSlot === slotKey ? styles.dragOver : ''}`}
                    onClick={() => onSlotClick(day, hour)}
                    onDragOver={(e) => {
                      if (enableDragDrop) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDragOverSlot(slotKey);
                      }
                    }}
                    onDragLeave={() => {
                      if (enableDragDrop) {
                        setDragOverSlot(null);
                      }
                    }}
                    onDrop={(e) => {
                      if (enableDragDrop && onDrop) {
                        e.preventDefault();
                        setDragOverSlot(null);
                        onDrop(day, hour);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Creeaza programare pe ${format(day, 'd MMMM', { locale: ro })} la ${hour}:00`}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSlotClick(day, hour);
                      }
                    }}
                  />
                );
              })}
              {appointmentPositions.map(({ apt, left, width }) => {
                const aptStart = new Date(apt.start_time);
                const aptEnd = new Date(apt.end_time);
                const aptStartTime = aptStart.getTime();
                const aptEndTime = aptEnd.getTime();

                const topOffset = aptStartTime - dayStart.getTime();
                const topPercent = (topOffset / dayDuration) * 100;

                const aptDuration = aptEndTime - aptStartTime;
                const heightPercent = (aptDuration / dayDuration) * 100;

                return (
                  <AppointmentBlock
                    key={apt.id}
                    appointment={apt}
                    style={{
                      top: `${topPercent}%`,
                      left: `${left}%`,
                      width: `${width}%`,
                      height: `${heightPercent}%`,
                    }}
                    onClick={onAppointmentClick}
                    enableDragDrop={enableDragDrop}
                    onDragStart={onDragStart ? (appointment) => onDragStart(appointment, day) : undefined}
                    onDragEnd={onDragEnd}
                    isDragging={draggedAppointment?.id === apt.id}
                    providers={providers}
                  />
                );
              })}
              {getBlockedTimesForDay(day).map((blockedTime) => {
                const btStart = new Date(blockedTime.start_time);
                const btEnd = new Date(blockedTime.end_time);
                const btStartTime = btStart.getTime();
                const btEndTime = btEnd.getTime();

                const topOffset = btStartTime - dayStart.getTime();
                const topPercent = (topOffset / dayDuration) * 100;

                const btDuration = btEndTime - btStartTime;
                const heightPercent = (btDuration / dayDuration) * 100;

                return (
                  <BlockedTimeBlock
                    key={blockedTime.id}
                    blockedTime={blockedTime}
                    style={{
                      top: `${topPercent}%`,
                      left: '0%',
                      width: '100%',
                      height: `${heightPercent}%`,
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
