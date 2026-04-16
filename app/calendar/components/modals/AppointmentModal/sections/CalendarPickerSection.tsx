import styles from '../../../../page.module.css';
import type { CalendarOption, DentistOption } from '../types';

interface CalendarPickerSectionProps {
  calendarOptions: CalendarOption[];
  calendarId: string;
  onCalendarChange: (id: string) => void;
  dentists: DentistOption[];
  dentistUserId: string;
  onDentistChange: (id: string) => void;
  loadingDentists: boolean;
  dentistError: string | null;
  lockCalendar: boolean;
  disabled: boolean;
  readOnly: boolean;
}

export function CalendarPickerSection({
  calendarOptions,
  calendarId,
  onCalendarChange,
  dentists,
  dentistUserId,
  onDentistChange,
  loadingDentists,
  dentistError,
  lockCalendar,
  disabled,
  readOnly,
}: CalendarPickerSectionProps) {
  const selected = calendarOptions.find((calendar) => String(calendar.id) === calendarId) || null;
  const selectedDentist = dentists.find((dentist) => String(dentist.userId) === dentistUserId) || null;
  const hasNoWritableCalendars = calendarOptions.length === 0;

  if (readOnly) {
    return (
      <div className={styles.modalField}>
        <label>Calendar</label>
        <div className={styles.previewValue}>
          {selected ? selected.name : '—'}
          {selectedDentist ? ` • ${selectedDentist.displayName}` : ''}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.modalField}>
        <label htmlFor="appt-calendar">Calendar *</label>
        <select
          id="appt-calendar"
          value={calendarId}
          onChange={(event) => onCalendarChange(event.target.value)}
          disabled={disabled || lockCalendar || hasNoWritableCalendars}
        >
          {hasNoWritableCalendars && <option value="">(niciun calendar disponibil)</option>}
          {calendarOptions.map((option) => (
            <option key={option.id} value={String(option.id)} disabled={option.disabled}>
              {option.name}
              {option.description ? ` — ${option.description}` : ''}
            </option>
          ))}
        </select>
        {hasNoWritableCalendars && (
          <p className={styles.fieldHint} role="alert">
            Nu exista calendare disponibile pentru creare.
          </p>
        )}
      </div>

      {dentists.length > 1 && (
        <div className={styles.modalField}>
          <label htmlFor="appt-dentist">Dentist</label>
          <select
            id="appt-dentist"
            value={dentistUserId}
            onChange={(event) => onDentistChange(event.target.value)}
            disabled={disabled || loadingDentists}
          >
            <option value="">(selecteaza)</option>
            {dentists.map((dentist) => (
              <option key={dentist.userId} value={String(dentist.userId)}>
                {dentist.displayName}
                {dentist.isCurrentUser ? ' (tu)' : ''}
              </option>
            ))}
          </select>
          {dentistError && <p className={styles.fieldHint}>{dentistError}</p>}
        </div>
      )}
    </>
  );
}
