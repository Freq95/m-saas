import { useMemo } from 'react';
import {
  startOfWeek,
  addDays,
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from 'date-fns';
import { ro } from 'date-fns/locale';

interface UseCalendarNavigationOptions {
  currentDate: Date;
  viewType: 'week' | 'month' | 'day';
}

interface UseCalendarNavigationResult {
  weekDays: Date[];
  monthDays: Date[];
  rangeLabel: string;
  hours: number[];
}

export function useCalendarNavigation({
  currentDate,
  viewType,
}: UseCalendarNavigationOptions): UseCalendarNavigationResult {
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [currentDate]);

  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const monthStartWeek = startOfWeek(monthStart, { weekStartsOn: 1 });
    const lastDayOfMonthWeek = startOfWeek(monthEnd, { weekStartsOn: 1 });
    const monthEndWeek = addDays(lastDayOfMonthWeek, 6);
    return eachDayOfInterval({ start: monthStartWeek, end: monthEndWeek });
  }, [currentDate]);

  const rangeLabel = useMemo(() => {
    if (viewType === 'day') {
      const label = format(currentDate, "EEEE, d MMMM yyyy", { locale: ro });
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    if (viewType === 'week') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(weekStart, "d MMMM", { locale: ro })} - ${format(
        addDays(weekStart, 6),
        "d MMMM yyyy",
        { locale: ro }
      )}`;
    }
    const monthYear = format(currentDate, "MMMM yyyy", { locale: ro });
    return monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
  }, [currentDate, viewType]);

  const hours = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 8); // 8 AM to 7 PM
  }, []);

  return {
    weekDays,
    monthDays,
    rangeLabel,
    hours,
  };
}
