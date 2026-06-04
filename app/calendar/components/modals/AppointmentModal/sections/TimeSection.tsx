import { memo } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from '../../../../page.module.css';
import type { RecurrenceForm } from '../types';
import NumberStepper from '@/components/NumberStepper';

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
  errors?: Partial<Record<'date' | 'startTime' | 'endTime' | 'recurrenceInterval' | 'recurrenceCount' | 'recurrenceEndDate', string>>;
}

function formatReadableRange(date: string, startTime: string, endTime: string): string {
  if (!date || !startTime || !endTime) return '—';
  const [y, m, d] = date.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '—';
  const dateObj = new Date(y, m - 1, d);
  if (Number.isNaN(dateObj.getTime())) return '—';
  return `${format(dateObj, "EEEE, d MMMM yyyy", { locale: ro })} • ${startTime} – ${endTime}`;
}

function openNativeTimePicker(event: { currentTarget: HTMLInputElement }) {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
  if (typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch {
    // Some browsers only allow showPicker during direct user gestures.
  }
}

function openNativeDatePicker(event: { currentTarget: HTMLInputElement }) {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
  if (typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch {
    // Some browsers only allow showPicker during direct user gestures.
  }
}

function TimeSectionBase({
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
  errors = {},
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
      <div className={`${styles.modalFieldRow} ${styles.timeFieldRow}`}>
        <div className={styles.modalField}>
          <label htmlFor="appt-date">Data <span className={styles.requiredMark}>*</span></label>
          <input
            id="appt-date"
            type="date"
            value={date}
            className={errors.date ? styles.fieldControlError : undefined}
            onClick={openNativeDatePicker}
            onFocus={openNativeDatePicker}
            onChange={(event) => onChange({ date: event.target.value })}
            disabled={disabled}
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? 'appt-date-error' : undefined}
          />
          {errors.date && (
            <p id="appt-date-error" className={styles.fieldErrorText} role="alert">
              {errors.date}
            </p>
          )}
        </div>
        <div className={styles.modalField}>
          <label htmlFor="appt-start-time">Ora start <span className={styles.requiredMark}>*</span></label>
          <input
            id="appt-start-time"
            type="time"
            value={startTime}
            step={900}
            className={errors.startTime ? styles.fieldControlError : undefined}
            onClick={openNativeTimePicker}
            onFocus={openNativeTimePicker}
            onChange={(event) => onChange({ startTime: event.target.value })}
            disabled={disabled}
            aria-invalid={Boolean(errors.startTime)}
            aria-describedby={errors.startTime ? 'appt-start-time-error' : undefined}
          />
          {errors.startTime && (
            <p id="appt-start-time-error" className={styles.fieldErrorText} role="alert">
              {errors.startTime}
            </p>
          )}
        </div>
        <div className={styles.modalField}>
          <label htmlFor="appt-end-time">Ora final <span className={styles.requiredMark}>*</span></label>
          <input
            id="appt-end-time"
            type="time"
            value={endTime}
            step={900}
            className={errors.endTime ? styles.fieldControlError : undefined}
            onClick={openNativeTimePicker}
            onFocus={openNativeTimePicker}
            onChange={(event) => onChange({ endTime: event.target.value })}
            disabled={disabled}
            aria-invalid={Boolean(errors.endTime)}
            aria-describedby={errors.endTime ? 'appt-end-time-error' : undefined}
          />
          {errors.endTime && (
            <p id="appt-end-time-error" className={styles.fieldErrorText} role="alert">
              {errors.endTime}
            </p>
          )}
        </div>
      </div>

      {allowRecurring && (
        <div className={styles.modalField}>
          <label className={styles.recurringToggleRow}>
            <span className={styles.recurringToggleText}>
              <span className={styles.recurringToggleTitle}>Programare recurenta</span>
              <span className={styles.recurringToggleHint}>
                {isRecurring ? 'Se repeta automat' : 'O singura aparitie'}
              </span>
            </span>
            <span className={styles.recurringToggleSwitch}>
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(event) => onRecurringToggle(event.target.checked)}
                disabled={disabled}
              />
              <span className={styles.recurringToggleTrack}>
                <span className={styles.recurringToggleThumb} />
              </span>
            </span>
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
                <NumberStepper
                  id="appt-rec-interval"
                  className={styles.recurrenceStepper}
                  value={recurrence.interval}
                  min={1}
                  max={52}
                  disabled={disabled}
                  ariaLabel="Interval recurenta"
                  onChange={(next) => onRecurrenceChange({ interval: next })}
                />
                {errors.recurrenceInterval && (
                  <p className={styles.fieldErrorText} role="alert">
                    {errors.recurrenceInterval}
                  </p>
                )}
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
                  <NumberStepper
                    id="appt-rec-count"
                    className={styles.recurrenceStepper}
                    value={recurrence.count}
                    min={1}
                    max={52}
                    disabled={disabled}
                    ariaLabel="Numar repetari recurenta"
                    onChange={(next) => onRecurrenceChange({ count: next })}
                  />
                  {errors.recurrenceCount && (
                    <p className={styles.fieldErrorText} role="alert">
                      {errors.recurrenceCount}
                    </p>
                  )}
                </div>
              ) : (
                <div className={styles.modalField}>
                  <label htmlFor="appt-rec-end-date">Data stop</label>
                  <input
                    id="appt-rec-end-date"
                    type="date"
                    value={recurrence.endDate}
                    onClick={openNativeDatePicker}
                    onFocus={openNativeDatePicker}
                    onChange={(event) => onRecurrenceChange({ endDate: event.target.value })}
                    disabled={disabled}
                    className={errors.recurrenceEndDate ? styles.fieldControlError : undefined}
                    aria-invalid={Boolean(errors.recurrenceEndDate)}
                    aria-describedby={errors.recurrenceEndDate ? 'appt-rec-end-date-error' : undefined}
                  />
                  {errors.recurrenceEndDate && (
                    <p id="appt-rec-end-date-error" className={styles.fieldErrorText} role="alert">
                      {errors.recurrenceEndDate}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export const TimeSection = memo(TimeSectionBase);
