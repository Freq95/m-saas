'use client';

import {
  addMonths,
  format,
  getISOWeek,
  getMonth,
  getYear,
  isSameDay,
  isSameMonth,
  isToday,
  setMonth,
  setYear,
  subMonths,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from '../page.module.css';

interface CalendarDatePickerDropdownProps {
  className?: string;
  hideSidePanel?: boolean;
  pickerDate: Date;
  currentDate: Date;
  pickerMonthStart: Date;
  pickerWeeks: Date[][];
  months: string[];
  years: number[];
  onPickerDateChange: (value: Date | ((current: Date) => Date)) => void;
  onDaySelect: (date: Date) => void;
  onTodayClick: () => void;
}

export function CalendarDatePickerDropdown({
  className,
  hideSidePanel = false,
  pickerDate,
  currentDate,
  pickerMonthStart,
  pickerWeeks,
  months,
  years,
  onPickerDateChange,
  onDaySelect,
  onTodayClick,
}: CalendarDatePickerDropdownProps) {
  return (
    <div
      className={[styles.dateDropdown, className].filter(Boolean).join(' ')}
      role="dialog"
      aria-label="Selecteaza data"
    >
      <div className={styles.dateDropdownCalendar}>
        <div className={styles.dropdownMonthHeader}>
          <button
            type="button"
            className={styles.dropdownArrow}
            onClick={() => onPickerDateChange((current) => subMonths(current, 1))}
            aria-label="Luna anterioara"
          >
            {'<'}
          </button>
          <span>{format(pickerDate, 'MMMM yyyy', { locale: ro })}</span>
          <button
            type="button"
            className={styles.dropdownArrow}
            onClick={() => onPickerDateChange((current) => addMonths(current, 1))}
            aria-label="Luna urmatoare"
          >
            {'>'}
          </button>
        </div>

        <div className={styles.dropdownWeekLabels}>
          <span>S</span>
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>

        <div className={styles.dropdownWeeks}>
          {pickerWeeks.map((week) => (
            <div key={week[0].toISOString()} className={styles.dropdownWeekRow}>
              <span className={styles.dropdownWeekNumber}>{getISOWeek(week[0])}</span>
              {week.map((day) => {
                const outsideMonth = !isSameMonth(day, pickerMonthStart);
                const selected = isSameDay(day, currentDate);
                const todayFlag = isToday(day);

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={[
                      styles.dropdownDay,
                      outsideMonth ? styles.dropdownDayMuted : '',
                      selected ? styles.dropdownDaySelected : '',
                      todayFlag ? styles.dropdownDayToday : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onDaySelect(day)}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {!hideSidePanel ? (
        <div className={styles.dateDropdownSide}>
          <div className={styles.yearSelector}>
            <button
              type="button"
              className={styles.dropdownArrow}
              onClick={() => onPickerDateChange((current) => setYear(current, getYear(current) - 1))}
              aria-label="An precedent"
            >
              {'<'}
            </button>
            <span>{getYear(pickerDate)}</span>
            <button
              type="button"
              className={styles.dropdownArrow}
              onClick={() => onPickerDateChange((current) => setYear(current, getYear(current) + 1))}
              aria-label="An urmator"
            >
              {'>'}
            </button>
          </div>

          <div className={styles.monthSelectorGrid}>
            {months.map((monthLabel, index) => (
              <button
                key={`${monthLabel}-${index}`}
                type="button"
                className={`${styles.monthSelectorButton}${getMonth(pickerDate) === index ? ` ${styles.monthSelectorButtonActive}` : ''}`}
                onClick={() => onPickerDateChange((current) => setMonth(current, index))}
              >
                {monthLabel}
              </button>
            ))}
          </div>

          <div className={styles.yearList}>
            {years.map((year) => (
              <button
                key={year}
                type="button"
                className={`${styles.yearListButton}${getYear(pickerDate) === year ? ` ${styles.yearListButtonActive}` : ''}`}
                onClick={() => onPickerDateChange((current) => setYear(current, year))}
              >
                {year}
              </button>
            ))}
          </div>

          <button type="button" className={styles.dropdownTodayLink} onClick={onTodayClick}>
            Astazi
          </button>
        </div>
      ) : (
        <button type="button" className={styles.dropdownTodayLink} onClick={onTodayClick}>
          Astazi
        </button>
      )}
    </div>
  );
}
