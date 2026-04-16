import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from '../../../../page.module.css';
import type { RecurrenceForm } from '../types';

interface TimeSectionProps {
  date: string;
  startTime: string;
  endTime: string;
  onChange: (patch: { date?: string; startTime?: string; endTime?: string }) => void;
  allowRecurring: boolean;
  isRecurring: boolean;
  onRecurringToggle: (value: boolean) => void;
  recurrence: RecurrenceForm;
  onRecurrenceChange: (patch: Partial<RecurrenceForm>) => void;
  disabled: boolean;
  readOnly: boolean;
}

function formatReadableRange(date: string, startTime: string, endTime: string): string {
  if (!date || !startTime || !endTime) return '—';
  const [y, m, d] = date.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '—';
  const dateObj = new Date(y, m - 1, d);
  if (Number.isNaN(dateObj.getTime())) return '—';
  return `${format(dateObj, "EEEE, d MMMM yyyy", { locale: ro })} • ${startTime} – ${endTime}`;
}

export function TimeSection({
  date,
  startTime,
  endTime,
  onChange,
  allowRecurring,
  isRecurring,
  onRecurringToggle,
  recurrence,
  onRecurrenceChange,
  disabled,
  readOnly,
}: TimeSectionProps) {
  if (readOnly) {
    return (
      <div className={styles.modalField}>
        <label>Data si ora</label>
        <div className={styles.previewValue}>{formatReadableRange(date, startTime, endTime)}</div>
      </div>
    );
  }

  return (
    <>
      <div className={styles.modalFieldRow}>
        <div className={styles.modalField}>
          <label htmlFor="appt-date">Data *</label>
          <input
            id="appt-date"
            type="date"
            value={date}
            onChange={(event) => onChange({ date: event.target.value })}
            disabled={disabled}
          />
        </div>
        <div className={styles.modalField}>
          <label htmlFor="appt-start-time">Ora start *</label>
          <input
            id="appt-start-time"
            type="time"
            value={startTime}
            step={900}
            onChange={(event) => onChange({ startTime: event.target.value })}
            disabled={disabled}
          />
        </div>
        <div className={styles.modalField}>
          <label htmlFor="appt-end-time">Ora final *</label>
          <input
            id="appt-end-time"
            type="time"
            value={endTime}
            step={900}
            onChange={(event) => onChange({ endTime: event.target.value })}
            disabled={disabled}
          />
        </div>
      </div>

      {allowRecurring && (
        <div className={styles.modalField}>
          <label className={styles.modalFieldLabelRow}>
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(event) => onRecurringToggle(event.target.checked)}
              disabled={disabled}
            />
            <span>Programare recurenta</span>
          </label>

          {isRecurring && (
            <div className={styles.modalFieldRow}>
              <div className={styles.modalField}>
                <label htmlFor="appt-rec-frequency">Frecventa</label>
                <select
                  id="appt-rec-frequency"
                  value={recurrence.frequency}
                  onChange={(event) =>
                    onRecurrenceChange({
                      frequency: event.target.value as RecurrenceForm['frequency'],
                    })
                  }
                  disabled={disabled}
                >
                  <option value="daily">Zilnic</option>
                  <option value="weekly">Saptamanal</option>
                  <option value="monthly">Lunar</option>
                </select>
              </div>

              <div className={styles.modalField}>
                <label htmlFor="appt-rec-interval">La fiecare</label>
                <input
                  id="appt-rec-interval"
                  type="number"
                  min={1}
                  value={recurrence.interval}
                  onChange={(event) =>
                    onRecurrenceChange({
                      interval: Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                    })
                  }
                  disabled={disabled}
                />
              </div>

              <div className={styles.modalField}>
                <label htmlFor="appt-rec-end-type">Se opreste</label>
                <select
                  id="appt-rec-end-type"
                  value={recurrence.endType}
                  onChange={(event) =>
                    onRecurrenceChange({
                      endType: event.target.value as RecurrenceForm['endType'],
                    })
                  }
                  disabled={disabled}
                >
                  <option value="count">Dupa N repetari</option>
                  <option value="date">La o data</option>
                </select>
              </div>

              {recurrence.endType === 'count' ? (
                <div className={styles.modalField}>
                  <label htmlFor="appt-rec-count">Numar repetari</label>
                  <input
                    id="appt-rec-count"
                    type="number"
                    min={1}
                    value={recurrence.count}
                    onChange={(event) =>
                      onRecurrenceChange({
                        count: Math.max(1, Number.parseInt(event.target.value, 10) || 1),
                      })
                    }
                    disabled={disabled}
                  />
                </div>
              ) : (
                <div className={styles.modalField}>
                  <label htmlFor="appt-rec-end-date">Data stop</label>
                  <input
                    id="appt-rec-end-date"
                    type="date"
                    value={recurrence.endDate}
                    onChange={(event) => onRecurrenceChange({ endDate: event.target.value })}
                    disabled={disabled}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
