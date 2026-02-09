'use client';

import React from 'react';
import styles from '../../page.module.css';
import type { Appointment } from '../../hooks/useCalendar';

interface AppointmentBlockProps {
  appointment: Appointment;
  style: React.CSSProperties;
  onClick: (appointment: Appointment) => void;
}

export const AppointmentBlock = React.memo<AppointmentBlockProps>(
  ({ appointment, style, onClick }) => {
    return (
      <div
        className={`${styles.appointment} ${styles[appointment.status]}`}
        style={style}
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
        <div className={styles.appointmentTitle}>{appointment.client_name}</div>
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
      prev.style.top === next.style.top &&
      prev.style.left === next.style.left &&
      prev.style.width === next.style.width &&
      prev.style.height === next.style.height
    );
  }
);

AppointmentBlock.displayName = 'AppointmentBlock';
