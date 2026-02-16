'use client';

import { format, isSameDay, isSameMonth } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from '../../page.module.css';
import type { Appointment } from '../../hooks/useCalendar';

interface MonthViewProps {
  monthDays: Date[];
  currentDate: Date;
  appointments: Appointment[];
  selectedDay?: Date | null;
  onDayClick: (day: Date) => void;
  onAppointmentClick: (appointment: Appointment) => void;
}

export function MonthView({
  monthDays,
  currentDate,
  appointments,
  selectedDay = null,
  onDayClick,
  onAppointmentClick,
}: MonthViewProps) {
  const getAppointmentsForDay = (day: Date) =>
    appointments.filter((apt) => isSameDay(new Date(apt.start_time), day));

  return (
    <div className={styles.monthCalendar}>
      <div className={styles.monthWeekDays}>
        {['Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'].map((day) => (
          <div key={day} className={styles.monthWeekDay}>
            {day}
          </div>
        ))}
      </div>
      <div className={styles.monthGrid}>
        {monthDays.map((day) => {
          const dayAppointments = getAppointmentsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isTodayFlag = isSameDay(day, new Date());
          const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;

          return (
            <div
              key={day.toISOString()}
              className={[
                styles.monthDay,
                !isCurrentMonth ? styles.monthDayOther : '',
                isTodayFlag ? styles.monthDayToday : '',
                isSelected && !isTodayFlag ? styles.monthDaySelected : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onDayClick(day)}
              role="button"
              tabIndex={0}
              aria-label={format(day, 'd MMMM yyyy', { locale: ro })}
              aria-pressed={isSelected}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onDayClick(day);
                }
              }}
            >
              <div className={styles.monthDayNumber}>{format(day, 'd')}</div>
              <div className={styles.monthDayAppointments}>
                {dayAppointments.slice(0, 3).map((apt) => (
                  <div
                    key={apt.id}
                    className={`${styles.monthAppointment} ${styles[apt.status] ?? ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAppointmentClick(apt);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onAppointmentClick(apt);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    title={`${apt.client_name} – ${apt.service_name}`}
                  >
                    {format(new Date(apt.start_time), 'HH:mm', { locale: ro })} {apt.client_name}
                  </div>
                ))}
                {dayAppointments.length > 3 && (
                  <div className={styles.monthAppointmentMore}>
                    +{dayAppointments.length - 3} mai multe
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
