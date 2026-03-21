'use client';

import React from 'react';
import { format } from 'date-fns';
import styles from '../../page.module.css';
import type { Appointment, Provider } from '../../hooks/useCalendar';
import { getCategoryColor, getStatusConfig } from '@/lib/appointment-colors';

interface AppointmentBlockProps {
  appointment: Appointment;
  style: React.CSSProperties;
  compact?: boolean;
  onClick: (appointment: Appointment) => void;
  onDragStart?: (appointment: Appointment) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  isHighlighted?: boolean;
  enableDragDrop?: boolean;
  providers?: Provider[]; // kept for API compatibility, no longer used for color
}

export const AppointmentBlock = React.memo<AppointmentBlockProps>(
  ({ appointment, style, compact = false, onClick, onDragStart, onDragEnd, isDragging = false, isHighlighted = false, enableDragDrop = false }) => {
    const statusCfg = getStatusConfig(appointment.status);
    const categoryColor = getCategoryColor(appointment.category);
    const isPast = new Date(appointment.end_time).getTime() < Date.now();
    const startLabel = format(new Date(appointment.start_time), 'HH:mm');
    const endLabel = format(new Date(appointment.end_time), 'HH:mm');

    const handleDragStart = (e: React.DragEvent) => {
      e.stopPropagation();
      if (onDragStart) onDragStart(appointment);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', appointment.id.toString());
    };

    const handleDragEnd = (e: React.DragEvent) => {
      e.stopPropagation();
      if (onDragEnd) onDragEnd();
    };

    const appointmentStyle: React.CSSProperties = {
      ...style,
      opacity: isPast ? Math.min(statusCfg.opacity, 0.55) : statusCfg.opacity,
      borderLeft: `5px solid ${categoryColor}`,
      background: `color-mix(in srgb, ${categoryColor} 14%, var(--color-surface))`,
    };
    const containerStyle: React.CSSProperties = {
      ...appointmentStyle,
      ...(compact && { padding: '0 0.42rem' }),
    };

    return (
      <div
        className={`${styles.appointment} ${isDragging ? styles.dragging : ''} ${isHighlighted ? styles.appointmentHighlighted : ''}`}
        style={containerStyle}
        draggable={enableDragDrop && appointment.status === 'scheduled'}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={(e) => {
          e.stopPropagation();
          onClick(appointment);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick(appointment);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`Programare ${appointment.client_name}, ${appointment.service_name}`}
      >
        <div className={styles.appointmentHeader}>
          <div className={`${styles.appointmentTitle} ${statusCfg.strikethrough ? styles.appointmentStrike : ''}`}>
            <span className={styles.appointmentName}>{appointment.client_name}</span>
            <span className={styles.appointmentTime}> · {startLabel}–{endLabel}</span>
          </div>
          <span
            className={styles.statusDot}
            style={{ background: statusCfg.dot }}
            aria-label={statusCfg.label}
          />
        </div>
        {!compact && <div className={styles.appointmentService}>{appointment.service_name}</div>}
      </div>
    );
  },
  (prev, next) =>
    prev.appointment.id === next.appointment.id &&
    prev.appointment.status === next.appointment.status &&
    prev.appointment.client_name === next.appointment.client_name &&
    prev.appointment.service_name === next.appointment.service_name &&
    prev.appointment.start_time === next.appointment.start_time &&
    prev.appointment.end_time === next.appointment.end_time &&
    prev.appointment.category === next.appointment.category &&
    prev.appointment.color === next.appointment.color &&
    prev.style.top === next.style.top &&
    prev.style.left === next.style.left &&
    prev.style.width === next.style.width &&
    prev.style.height === next.style.height &&
    prev.compact === next.compact &&
    prev.isDragging === next.isDragging &&
    prev.isHighlighted === next.isHighlighted &&
    prev.enableDragDrop === next.enableDragDrop &&
    prev.onClick === next.onClick &&
    prev.onDragStart === next.onDragStart &&
    prev.onDragEnd === next.onDragEnd,
);

AppointmentBlock.displayName = 'AppointmentBlock';
