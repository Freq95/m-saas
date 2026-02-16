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
import type { CalendarViewType } from './useCalendar';

interface UseCalendarNavigationOptions {
  currentDate: Date;
  viewType: CalendarViewType;
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
    const daysCount = viewType === 'workweek' ? 5 : 7;
    return Array.from({ length: daysCount }, (_, i) => addDays(weekStart, i));
  }, [currentDate, viewType]);

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
    if (viewType === 'week' || viewType === 'workweek') {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const rangeEnd = addDays(weekStart, viewType === 'workweek' ? 4 : 6);
      return `${format(weekStart, "d MMMM", { locale: ro })} - ${format(
        rangeEnd,
        "d MMMM yyyy",
        { locale: ro }
      )}`;
    }
    const monthYear = format(currentDate, "MMMM yyyy", { locale: ro });
    return monthYear.charAt(0).toUpperCase() + monthYear.slice(1);
  }, [currentDate, viewType]);

  const hours = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i); // 00:00 to 23:00
  }, []);

  return {
    weekDays,
    monthDays,
    rangeLabel,
    hours,
  };
}
