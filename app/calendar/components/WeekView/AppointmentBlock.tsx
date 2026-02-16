'use client';

import React from 'react';
import styles from '../../page.module.css';
import type { Appointment, Provider } from '../../hooks/useCalendar';

interface AppointmentBlockProps {
  appointment: Appointment;
  style: React.CSSProperties;
  onClick: (appointment: Appointment) => void;
  onDragStart?: (appointment: Appointment) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  enableDragDrop?: boolean;
  providers?: Provider[];
}

export const AppointmentBlock = React.memo<AppointmentBlockProps>(
  ({ appointment, style, onClick, onDragStart, onDragEnd, isDragging = false, enableDragDrop = false, providers = [] }) => {
    const appointmentStatusClass = appointment.status === 'no-show' ? 'no_show' : appointment.status;
    const badgeStatusClass = appointment.status === 'no_show' ? 'no-show' : appointment.status;

    const handleDragStart = (e: React.DragEvent) => {
      e.stopPropagation();
      if (onDragStart) {
        onDragStart(appointment);
      }
      // Set drag effect
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', appointment.id.toString());
    };

    const handleDragEnd = (e: React.DragEvent) => {
      e.stopPropagation();
      if (onDragEnd) {
        onDragEnd();
      }
    };

    // Category color takes priority, then provider color
    const categoryColor = appointment.color;
    const provider = providers.find((p) => p.id === appointment.provider_id);
    const accentColor = categoryColor || provider?.color;

    const appointmentStyle: React.CSSProperties = accentColor
      ? {
          ...style,
          borderLeftColor: accentColor,
          borderLeftWidth: '4px',
          borderLeftStyle: 'solid' as React.CSSProperties['borderLeftStyle'],
          ...(categoryColor && {
            background: `color-mix(in srgb, ${categoryColor} 18%, var(--color-surface))`,
          }),
        }
      : style;

    return (
      <div
        className={`${styles.appointment} ${styles[appointmentStatusClass]} ${isDragging ? styles.dragging : ''}`}
        style={appointmentStyle}
        draggable={enableDragDrop && badgeStatusClass === 'scheduled'}
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
          <div className={styles.appointmentTitle}>{appointment.client_name}</div>
          <span className={`${styles.statusBadge} ${styles[`statusBadge--${badgeStatusClass}`]}`}>
            {badgeStatusClass === 'scheduled' && 'Programat'}
            {badgeStatusClass === 'completed' && 'Completat'}
            {badgeStatusClass === 'cancelled' && 'Anulat'}
            {badgeStatusClass === 'no-show' && 'Absent'}
          </span>
        </div>
        <div className={styles.appointmentService}>{appointment.service_name}</div>
      </div>
    );
  },
  (prev, next) => {
    // Only re-render if the appointment data changed
    return (
      prev.appointment.id === next.appointment.id &&
      prev.appointment.status === next.appointment.status &&
      prev.appointment.client_name === next.appointment.client_name &&
      prev.appointment.service_name === next.appointment.service_name &&
      prev.appointment.provider_id === next.appointment.provider_id &&
      prev.appointment.color === next.appointment.color &&
      prev.style.top === next.style.top &&
      prev.style.left === next.style.left &&
      prev.style.width === next.style.width &&
      prev.style.height === next.style.height &&
      prev.isDragging === next.isDragging &&
      prev.providers?.length === next.providers?.length
    );
  }
);

AppointmentBlock.displayName = 'AppointmentBlock';
