'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';

/**
 * Stable callback that always invokes the latest function. The returned function
 * has the same identity for the component's lifetime, so it never invalidates
 * memoized children (WeekView, AppointmentBlock, DayPanel). Equivalent to the
 * upcoming `useEffectEvent` hook. Safe for event handlers only.
 */
function useEventCallback<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  return useCallback(((...args: never[]) => ref.current(...args)) as T, []);
}
import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getMonth,
  getYear,
  isSameDay,
  isToday,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import { useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { useToast } from '@/lib/useToast';
import { useIsMobile } from '@/lib/useIsMobile';
import { ToastContainer } from '@/components/Toast';
import {
  useCalendar,
  useAppointmentsSWR as useAppointments,
  useAvailabilityBlocks,
  useCalendarList,
  type Appointment,
  type AvailabilityBlock,
  type CalendarListItem,
  type CalendarListResponse,
} from './hooks';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import {
  CalendarDatePickerDropdown,
  WeekView,
  MonthView,
  DayPanel,
  AppointmentModal,
  DeleteConfirmModal,
  ConflictWarningModal,
} from './components';
import { AppointmentCard, CalendarScopeDropdown } from './components/DayPanel/DayPanel';
import { useCalendarNavigation } from './hooks/useCalendarNavigation';
import { canCreateOnCalendar, decorateAppointmentWithCalendarAccess } from './lib/appointment-access';
import { AsistentReassignBanner } from './components/AsistentReassignBanner';
import { RoleMigrationBanner } from './components/RoleMigrationBanner';

interface Service {
  id: number;
  name: string;
  duration_minutes: number;
  price: number;
}

interface CalendarPageClientProps {
  initialAppointments: Appointment[];
  initialServices: Service[];
  initialCalendarList: CalendarListResponse;
  initialAvailabilityBlocks: AvailabilityBlock[];
  initialAvailabilityBlocksCacheKey: string | null;
  initialSessionUserId: number;
  initialSessionDbUserId: string;
  initialDate: string;
  initialViewType?: 'week';
  asistentReassignState?: 'empty' | 'inactive' | null;
}

interface ConflictItem {
  type: string;
  message: string;
}

interface ConflictSuggestion {
  startTime: string;
  endTime: string;
  reason: string;
}

type AppointmentModalMode = 'create' | 'edit' | 'view';
type SlotMinute = 0 | 15 | 30 | 45;

type AppointmentModalData = {
  clientId?: number | null;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  forceNewClient?: boolean;
  calendarId?: number;
  calendarName?: string;
  dentistUserId?: number;
  dentistDisplayName?: string;
  /** Multi-service: ordered list of selected service IDs (as strings). */
  serviceIds: string[];
  /** Denormalized service names in selection order for display/aria. */
  serviceNames?: string[];
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes: string;
  category?: string | null;
  categoryId?: number | null;
  categoryLabel?: string | null;
  categoryColor?: string | null;
  color?: string;
  status?: string;
  isRecurring?: boolean;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endType: 'date' | 'count';
    endDate?: string;
    count?: number;
  };
  /** When editing a recurring appointment: 'this' (default) or 'series'. */
  scope?: 'this' | 'series';
};

type MobileRangeMode = '3days' | '5days' | '7days' | 'workweek' | 'week';
type MobileSlotInterval = 15 | 30 | 60;
type MobileCalendarView = 'day' | 'week';
type CalendarColumnMode = 'unified' | 'columns';

const DESKTOP_DENSITY_STORAGE_KEY = 'calendar:density:desktopHourHeight';
const MOBILE_DENSITY_STORAGE_KEY = 'calendar:density:mobileHourHeight';
const DESKTOP_HOUR_HEIGHT_BOUNDS = { min: 40, max: 120, fallback: 72 };
const MOBILE_HOUR_HEIGHT_BOUNDS = { min: 48, max: 96, fallback: 60 };

function openNativeTimePicker(event: { currentTarget: HTMLInputElement }) {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
  if (typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch {
    // Some browsers only allow showPicker during direct user gestures.
  }
}

const MOBILE_RANGE_STORAGE_KEY = 'calendar:mobile-range-mode';
const MOBILE_SLOT_INTERVAL_STORAGE_KEY = 'calendar:mobile-slot-interval';
const MOBILE_WORKING_HOURS_STORAGE_KEY = 'calendar:mobile-working-hours';
const MOBILE_VIEW_STORAGE_KEY = 'calendar:mobile-view';
const CALENDAR_COLUMN_MODE_STORAGE_KEY = 'calendar:column-mode';
const DESKTOP_VIEW_STORAGE_KEY = 'calendar:desktop-view';

type DesktopView = 'week' | 'month';
const MOBILE_RANGE_OPTIONS: Array<{ value: MobileRangeMode; label: string }> = [
  { value: '3days', label: '3 zile' },
  { value: '5days', label: '5 zile' },
  { value: '7days', label: '7 zile' },
  { value: 'workweek', label: 'Lu-Vi' },
  { value: 'week', label: 'Lu-Du' },
];
const MOBILE_SLOT_INTERVAL_OPTIONS: Array<{ value: MobileSlotInterval; label: string }> = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 60, label: '60 min' },
];

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getMobileRollingDayCount(mode: MobileRangeMode): number | null {
  if (mode === '3days') return 3;
  if (mode === '5days') return 5;
  if (mode === '7days') return 7;
  return null;
}

function areNumberArraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function readSavedMobileSlotInterval(): MobileSlotInterval {
  if (typeof window === 'undefined') return 15;
  const parsed = Number.parseInt(window.localStorage.getItem(MOBILE_SLOT_INTERVAL_STORAGE_KEY) || '', 10);
  return parsed === 30 || parsed === 60 ? parsed : 15;
}

function readSavedMobileView(): MobileCalendarView {
  if (typeof window === 'undefined') return 'day';
  return window.localStorage.getItem(MOBILE_VIEW_STORAGE_KEY) === 'week' ? 'week' : 'day';
}

function readSavedCalendarColumnMode(): CalendarColumnMode {
  if (typeof window === 'undefined') return 'unified';
  return window.localStorage.getItem(CALENDAR_COLUMN_MODE_STORAGE_KEY) === 'columns' ? 'columns' : 'unified';
}

function clampDensity(value: number, bounds: { min: number; max: number; fallback: number }): number {
  if (!Number.isFinite(value)) return bounds.fallback;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

function readSavedDensity(
  storageKey: string,
  bounds: { min: number; max: number; fallback: number }
): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? clampDensity(parsed, bounds) : null;
}

/**
 * Returns a soft-warning string for appointments scheduled outside the
 * configured working hours or on Sunday. The save still proceeds — this is
 * purely informational so the user can correct an accidental off-hours
 * booking without the system blocking them (some clinics work nights /
 * Sundays intentionally, so a hard reject would be wrong).
 *
 * Returns null when the booking is within normal hours and not on Sunday.
 */
function getOffHoursWarning(
  startIso: string | undefined,
  endIso: string | undefined,
  workingHours: { startHour: number; endHour: number }
): string | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const isSunday = start.getDay() === 0;
  const startsBefore = start.getHours() < workingHours.startHour;
  // endHour is exclusive: an end_time exactly at endHour:00 is fine.
  const endsAfter =
    end.getHours() > workingHours.endHour ||
    (end.getHours() === workingHours.endHour && end.getMinutes() > 0);
  if (!isSunday && !startsBefore && !endsAfter) return null;
  if (isSunday) return 'Programarea este în zi de duminica.';
  return 'Programarea este în afara orelor de lucru.';
}

function computeFitHourHeight(
  availableHeight: number | null,
  hourCount: number,
  bounds: { min: number; max: number; fallback: number },
  chromePx: number
): number {
  if (!availableHeight || hourCount <= 0) return bounds.fallback;
  return clampDensity((availableHeight - chromePx) / hourCount, bounds);
}

function clampWorkingHour(value: number, fallback: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(24, Math.max(0, value));
}

function hourToTimeValue(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function timeValueToHour(value: string, fallback: number): number {
  const [hourPart] = value.split(':');
  return clampWorkingHour(Number.parseInt(hourPart, 10), fallback);
}

function availabilityBlockOverlapsDay(block: AvailabilityBlock, day: Date): boolean {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);
  const blockStart = new Date(block.start_time);
  const blockEnd = new Date(block.end_time);
  if (Number.isNaN(blockStart.getTime()) || Number.isNaN(blockEnd.getTime())) return false;
  return blockStart < dayEnd && blockEnd > dayStart;
}

function formatAvailabilityBlockTime(block: AvailabilityBlock): string {
  if (block.all_day) return 'Toata ziua';
  const start = new Date(block.start_time);
  const end = new Date(block.end_time);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  return `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`;
}

function readSavedMobileWorkingHours(): { startHour: number; endHour: number } {
  if (typeof window === 'undefined') return { startHour: 8, endHour: 20 };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MOBILE_WORKING_HOURS_STORAGE_KEY) || '{}');
    const startHour = clampWorkingHour(Number.parseInt(String(parsed.startHour), 10), 8);
    const endHour = clampWorkingHour(Number.parseInt(String(parsed.endHour), 10), 20);
    return endHour > startHour ? { startHour, endHour } : { startHour: 8, endHour: 20 };
  } catch {
    return { startHour: 8, endHour: 20 };
  }
}

export default function CalendarPageClient({
  initialAppointments,
  initialServices,
  initialCalendarList,
  initialAvailabilityBlocks,
  initialAvailabilityBlocksCacheKey,
  initialSessionUserId,
  initialSessionDbUserId,
  initialDate,
  initialViewType = 'week',
  asistentReassignState = null,
}: CalendarPageClientProps) {
  const toast = useToast();
  const showErrorToast = toast.error;
  const showInfoToast = toast.info;
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [mobileRangeMode, setMobileRangeMode] = useState<MobileRangeMode>(() => {
    if (typeof window === 'undefined') return 'week';
    const savedMode = window.localStorage.getItem(MOBILE_RANGE_STORAGE_KEY);
    return MOBILE_RANGE_OPTIONS.some((option) => option.value === savedMode)
      ? (savedMode as MobileRangeMode)
      : 'week';
  });
  const [mobileRangeStartDate, setMobileRangeStartDate] = useState<Date>(() => startOfLocalDay(new Date()));
  const [mobileSlotInterval, setMobileSlotInterval] = useState<MobileSlotInterval>(readSavedMobileSlotInterval);
  const [mobileWorkingHours, setMobileWorkingHours] = useState(readSavedMobileWorkingHours);
  const [calendarColumnMode, setCalendarColumnMode] = useState<CalendarColumnMode>(readSavedCalendarColumnMode);
  const [desktopHourHeight, setDesktopHourHeightState] = useState<number | null>(() =>
    readSavedDensity(DESKTOP_DENSITY_STORAGE_KEY, DESKTOP_HOUR_HEIGHT_BOUNDS)
  );
  const [mobileHourHeight, setMobileHourHeightState] = useState<number | null>(() =>
    readSavedDensity(MOBILE_DENSITY_STORAGE_KEY, MOBILE_HOUR_HEIGHT_BOUNDS)
  );
  const sessionUserId = initialSessionUserId;
  const sessionDbUserId = initialSessionDbUserId;
  const { state, actions } = useCalendar(initialDate, initialViewType);
  const {
    ownCalendars,
    sharedCalendars,
    calendars,
    loading: calendarsLoading,
  } = useCalendarList({ fallbackData: initialCalendarList });
  const visibleCalendarsStorageKey = useMemo(
    () => `calendar:visibleIds:${sessionDbUserId || String(sessionUserId || 'anonymous')}`,
    [sessionDbUserId, sessionUserId]
  );
  const calendarMap = useMemo(
    () => new Map<number, CalendarListItem>(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars]
  );
  const allCalendarIds = useMemo(
    () => calendars.map((calendar) => calendar.id),
    [calendars]
  );
  const allCalendarIdsKey = allCalendarIds.join(',');
  const [visibleCalendarIds, setVisibleCalendarIds] = useState<number[]>([]);
  const [visibleCalendarIdsInitialized, setVisibleCalendarIdsInitialized] = useState(false);

  useEffect(() => {
    if (searchParams.get('inbox') !== 'blocked') return;
    showInfoToast('Inbox-ul este disponibil doar pentru medici.');
    // Strip the marker so a refresh / back-button doesn't re-fire the toast.
    // We touch history directly (rather than router.replace) to keep this a
    // one-line side effect without pulling in the navigation hook.
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('inbox');
      window.history.replaceState(null, '', url.pathname + (url.search ? `?${url.searchParams.toString()}` : ''));
    }
  }, [searchParams, showInfoToast]);

  useEffect(() => {
    if (calendarsLoading) return;

    const currentAllCalendarIds = allCalendarIdsKey
      ? allCalendarIdsKey.split(',').map((value) => Number.parseInt(value, 10)).filter(Number.isInteger)
      : [];
    const validCalendarIds = new Set(currentAllCalendarIds);

    if (!visibleCalendarIdsInitialized) {
      let nextVisibleIds = currentAllCalendarIds;

      if (typeof window !== 'undefined') {
        try {
          const saved = JSON.parse(window.localStorage.getItem(visibleCalendarsStorageKey) || 'null');
          if (Array.isArray(saved)) {
            nextVisibleIds = saved
              .map((value) => Number.parseInt(String(value), 10))
              .filter((id): id is number => Number.isInteger(id) && validCalendarIds.has(id));
          }
        } catch {
          nextVisibleIds = currentAllCalendarIds;
        }
      }

      setVisibleCalendarIds(nextVisibleIds);
      setVisibleCalendarIdsInitialized(true);
      return;
    }

    setVisibleCalendarIds((current) => {
      const next = current.filter((id) => validCalendarIds.has(id));
      return areNumberArraysEqual(current, next) ? current : next;
    });
  }, [
    allCalendarIdsKey,
    calendarsLoading,
    visibleCalendarIdsInitialized,
    visibleCalendarsStorageKey,
  ]);

  useEffect(() => {
    if (!visibleCalendarIdsInitialized || typeof window === 'undefined') return;
    window.localStorage.setItem(visibleCalendarsStorageKey, JSON.stringify(visibleCalendarIds));
  }, [visibleCalendarIds, visibleCalendarIdsInitialized, visibleCalendarsStorageKey]);

  const visibleCalendarIdSet = useMemo(
    () => new Set(visibleCalendarIds),
    [visibleCalendarIds]
  );
  const visibleCalendars = useMemo(
    () => calendars.filter((calendar) => visibleCalendarIdSet.has(calendar.id)),
    [calendars, visibleCalendarIdSet]
  );
  const writableCalendars = useMemo(
    () => calendars.filter((calendar) => canCreateOnCalendar(calendar)),
    [calendars]
  );
  const selectedCalendar = useMemo(
    () => visibleCalendars[0] || null,
    [visibleCalendars]
  );
  const defaultCreateCalendar = useMemo(() => {
    const visibleWritableCalendar = visibleCalendars.find((calendar) => canCreateOnCalendar(calendar));
    return visibleWritableCalendar || writableCalendars[0] || null;
  }, [visibleCalendars, writableCalendars]);
  const calendarOptions = useMemo(
    () =>
      writableCalendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        color: calendar.color_mine,
        isOwn: calendar.isOwner,
        isDefault: Boolean(calendar.is_default),
        description: calendar.isOwner
          ? 'Calendar propriu'
          : calendar.sharedByName
            ? `Partajat de ${calendar.sharedByName}`
            : 'Calendar partajat',
      })),
    [writableCalendars]
  );
  const weekCalendarColumns = useMemo(
    () => (
      calendarColumnMode === 'columns' && visibleCalendars.length > 1
        ? visibleCalendars.map((calendar) => ({
          id: calendar.id,
          name: calendar.name,
          color: calendar.color_mine,
          ownerUserId: calendar.owner_user_id,
        }))
        : []
    ),
    [calendarColumnMode, visibleCalendars]
  );
  const canCreateAppointments = writableCalendars.length > 0;
  const appointmentsFetchCalendarIds = calendarsLoading
    ? undefined
    : visibleCalendarIdsInitialized
      ? visibleCalendarIds
      : allCalendarIds;
  const { weekDays } = useCalendarNavigation({
    currentDate: state.currentDate,
    viewType: 'week',
  });
  const visibleHours = useMemo(
    () =>
      Array.from(
        { length: Math.max(1, mobileWorkingHours.endHour - mobileWorkingHours.startHour) },
        (_, index) => mobileWorkingHours.startHour + index
      ),
    [mobileWorkingHours]
  );
  const visibleWeekDays = useMemo(() => {
    const rollingDayCount = getMobileRollingDayCount(mobileRangeMode);
    if (rollingDayCount) {
      return Array.from({ length: rollingDayCount }, (_, index) => addDays(mobileRangeStartDate, index));
    }

    if (mobileRangeMode === 'workweek') {
      const weekStart = startOfWeek(state.currentDate, { weekStartsOn: 1 });
      return Array.from({ length: 5 }, (_, index) => addDays(weekStart, index));
    }

    return weekDays;
  }, [mobileRangeMode, mobileRangeStartDate, state.currentDate, weekDays]);
  const mobileHours = visibleHours;
  const mobileWeekDays = visibleWeekDays;

  // Month grid days for the desktop month view. Covers the calendar weeks
  // that intersect the current month (so the grid is always a clean 5- or
  // 6-row rectangle starting Monday).
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(state.currentDate);
    const monthEnd = endOfMonth(state.currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [state.currentDate]);
  const fitDesktopHourHeight = useMemo(
    () => computeFitHourHeight(
      availableHeight,
      visibleHours.length,
      DESKTOP_HOUR_HEIGHT_BOUNDS,
      150
    ),
    [availableHeight, visibleHours.length]
  );
  const fitMobileHourHeight = useMemo(
    () => computeFitHourHeight(
      availableHeight,
      mobileHours.length,
      MOBILE_HOUR_HEIGHT_BOUNDS,
      150
    ),
    [availableHeight, mobileHours.length]
  );
  const effectiveDesktopHourHeight = desktopHourHeight ?? fitDesktopHourHeight;
  const effectiveMobileHourHeight = mobileHourHeight ?? fitMobileHourHeight;
  const setDesktopHourHeight = (value: number) => {
    const next = clampDensity(value, DESKTOP_HOUR_HEIGHT_BOUNDS);
    setDesktopHourHeightState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DESKTOP_DENSITY_STORAGE_KEY, String(next));
    }
  };
  const setMobileHourHeight = (value: number) => {
    const next = clampDensity(value, MOBILE_HOUR_HEIGHT_BOUNDS);
    setMobileHourHeightState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(MOBILE_DENSITY_STORAGE_KEY, String(next));
    }
  };
  const fitDesktopDensity = () => setDesktopHourHeight(fitDesktopHourHeight);
  const resetDesktopDensity = () => setDesktopHourHeight(DESKTOP_HOUR_HEIGHT_BOUNDS.fallback);

  // Desktop view mode (week | month). Persisted so the user keeps their
  // last choice across sessions; mobile keeps its own week/day toggle.
  // Declared up here because `appointmentFetchRange` needs to widen its
  // window to the full month grid when month view is active.
  const [desktopView, setDesktopView] = useState<DesktopView>(() => {
    if (typeof window === 'undefined') return 'week';
    const saved = window.localStorage.getItem(DESKTOP_VIEW_STORAGE_KEY);
    return saved === 'month' ? 'month' : 'week';
  });

  const appointmentFetchRange = useMemo(() => {
    // Month view widens the fetch window to the full month grid so the
    // calendar shows appointments for every visible day. Week view stays
    // tight to the visible week to keep the DB query small.
    if (desktopView === 'month' && !isMobile) {
      if (monthDays.length === 0) return null;
      return { start: monthDays[0], end: monthDays[monthDays.length - 1] };
    }
    if (visibleWeekDays.length === 0) return null;
    return {
      start: visibleWeekDays[0],
      end: visibleWeekDays[visibleWeekDays.length - 1],
    };
  }, [desktopView, isMobile, monthDays, visibleWeekDays]);

  const isTodayInMobileRange = useMemo(() => {
    if (!isMobile || mobileWeekDays.length === 0) return false;
    return mobileWeekDays.some((day) => isToday(day));
  }, [isMobile, mobileWeekDays]);

  useLayoutEffect(() => {
    const updateHeight = () => {
      const el = containerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setAvailableHeight(Math.max(320, Math.floor(window.innerHeight - top)));
    };

    updateHeight();
    const raf = requestAnimationFrame(updateHeight);
    window.addEventListener('resize', updateHeight);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Lock body scroll while the mobile calendar is mounted. Without this, iOS
  // Safari's dynamic URL bar allows the page body to scroll, which drags the
  // supposedly-fixed mobile header and day strip out of view together with
  // the appointment list (the inner list is the only intended scroll surface).
  useEffect(() => {
    if (!isMobile) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [isMobile]);

  const { appointments, loading, refetch, createAppointment, updateAppointment, deleteAppointment } =
    useAppointments({
      currentDate: state.currentDate,
      viewType: 'week',
      rangeStartDate: appointmentFetchRange?.start,
      rangeEndDate: appointmentFetchRange?.end,
      userId: sessionUserId,
      calendarIds: appointmentsFetchCalendarIds,
      search: debouncedSearchQuery,
      initialAppointments,
      initialAppointmentsAreFresh: !(desktopView === 'month' && !isMobile),
    });
  const {
    blocks: availabilityBlocks,
  } = useAvailabilityBlocks({
    currentDate: state.currentDate,
    viewType: 'week',
    rangeStartDate: appointmentFetchRange?.start,
    rangeEndDate: appointmentFetchRange?.end,
    calendarIds: appointmentsFetchCalendarIds,
    initialBlocks: initialAvailabilityBlocks,
    initialBlocksCacheKey: initialAvailabilityBlocksCacheKey,
  });
  const decoratedAppointments = useMemo(
    () => appointments
      .filter((appointment) => {
        if (!visibleCalendarIdsInitialized) return true;
        return typeof appointment.calendar_id === 'number' && visibleCalendarIdSet.has(appointment.calendar_id);
      })
      .map((appointment) => decorateAppointmentWithCalendarAccess(appointment, calendarMap, sessionDbUserId)),
    [appointments, calendarMap, sessionDbUserId, visibleCalendarIdSet, visibleCalendarIdsInitialized]
  );
  // Cancelled appointments are hidden from the time-grid views (WeekView,
  // MonthView) so they don't clutter the calendar. They still appear in
  // the right-side DayPanel (with a strikethrough/dimmed treatment) and
  // remain searchable.
  const gridAppointments = useMemo(
    () => decoratedAppointments.filter((appointment) => appointment.status !== 'cancelled'),
    [decoratedAppointments]
  );
  const decoratedAvailabilityBlocks = useMemo(
    () => availabilityBlocks.filter((block) => {
      if (!visibleCalendarIdsInitialized) return true;
      if (Array.isArray(block.visible_calendar_ids)) {
        return block.visible_calendar_ids.some((id) => visibleCalendarIdSet.has(id));
      }
      return typeof block.calendar_id === 'number' && visibleCalendarIdSet.has(block.calendar_id);
    }),
    [availabilityBlocks, visibleCalendarIdSet, visibleCalendarIdsInitialized]
  );

  const [selectedDay, setSelectedDay]               = useState<Date>(() => new Date());
  const [pendingCancelAppointment, setPendingCancelAppointment] = useState<Appointment | null>(null);
  const [hoveredAppointmentId, setHoveredAppointmentId] = useState<number | null>(null);
  const [services, setServices]                     = useState<Service[]>(initialServices);
  const hasRequestedServicesRef = useRef(false);
  const [showCreateModal, setShowCreateModal]       = useState(false);
  const [appointmentModalMode, setAppointmentModalMode] = useState<AppointmentModalMode>('create');
  const [editInitialData, setEditInitialData] = useState<AppointmentModalData | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm]   = useState(false);
  const [showConflictModal, setShowConflictModal]   = useState(false);
  const [conflictData, setConflictData] = useState<{ conflicts: ConflictItem[]; suggestions: ConflictSuggestion[] }>({
    conflicts: [],
    suggestions: [],
  });
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [pickerDate, setPickerDate] = useState<Date>(state.currentDate);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const justDroppedRef = useRef(false);
  const justDroppedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledContactPrefillRef = useRef<number | null>(null);
  const pendingRescheduleIdRef = useRef<number | null>(null);

  // Mobile-specific state
  const [mobileView, setMobileView] = useState<MobileCalendarView>(readSavedMobileView);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');
  const [mobileSwipeDeltaX, setMobileSwipeDeltaX] = useState(0);
  const mobileSwipeDeltaXRef = useRef(0);
  const mobileSwipeStartXRef = useRef<number | null>(null);
  const mobileSwipeStartYRef = useRef<number | null>(null);
  const mobileSwipeAxisRef = useRef<'horizontal' | 'vertical' | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  // Mobile day appointments (filtered + sorted for the selected day)
  const mobileDayAppointments = useMemo(() => {
    if (!isMobile) return [];
    return [...decoratedAppointments]
      .filter((apt) => isSameDay(new Date(apt.start_time), selectedDay))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [isMobile, decoratedAppointments, selectedDay]);
  const mobileDayBlocks = useMemo(() => {
    if (!isMobile) return [];
    return [...decoratedAvailabilityBlocks]
      .filter((block) => availabilityBlockOverlapsDay(block, selectedDay))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [isMobile, decoratedAvailabilityBlocks, selectedDay]);

  // Mobile search results
  const mobileSearchResults = useMemo(() => {
    if (!isMobile || !mobileSearchQuery.trim()) return [];
    const q = mobileSearchQuery.toLowerCase();
    return [...decoratedAppointments]
      .filter(
        (apt) =>
          apt.client_name.toLowerCase().includes(q) ||
          apt.service_name.toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [isMobile, mobileSearchQuery, decoratedAppointments]);


  // Focus search input when search overlay opens
  useEffect(() => {
    if (mobileSearchOpen && mobileSearchInputRef.current) {
      mobileSearchInputRef.current.focus();
    }
  }, [mobileSearchOpen]);

  const weekStart = useMemo(() => startOfWeek(state.currentDate, { weekStartsOn: 1 }), [state.currentDate]);
  const weekEnd = useMemo(() => endOfWeek(state.currentDate, { weekStartsOn: 1 }), [state.currentDate]);
  const weekRangeLabel = useMemo(() => {
    const monthLabel = (date: Date) => format(date, 'MMM', { locale: ro }).replace('.', '');
    const sameMonth = getMonth(weekStart) === getMonth(weekEnd);
    if (sameMonth) {
      return `${format(weekStart, 'd', { locale: ro })}-${format(weekEnd, 'd', { locale: ro })} ${monthLabel(weekEnd)} ${format(weekEnd, 'yyyy', { locale: ro })}`;
    }
    return `${format(weekStart, 'd', { locale: ro })} ${monthLabel(weekStart)}-${format(weekEnd, 'd', { locale: ro })} ${monthLabel(weekEnd)} ${format(weekEnd, 'yyyy', { locale: ro })}`;
  }, [weekStart, weekEnd]);
  const mobileMonthLabel = useMemo(
    () => format(state.currentDate, 'LLLL yyyy', { locale: ro }).toLocaleLowerCase('ro-RO'),
    [state.currentDate]
  );
  const pickerMonthStart = useMemo(() => startOfMonth(pickerDate), [pickerDate]);
  const pickerDays = useMemo(() => {
    const monthStartWeek = startOfWeek(pickerMonthStart, { weekStartsOn: 1 });
    const monthEndWeek = endOfWeek(endOfMonth(pickerMonthStart), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: monthStartWeek, end: monthEndWeek });
  }, [pickerMonthStart]);
  const pickerWeeks = useMemo(() => {
    const weeks: Date[][] = [];
    for (let i = 0; i < pickerDays.length; i += 7) {
      weeks.push(pickerDays.slice(i, i + 7));
    }
    return weeks;
  }, [pickerDays]);
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, idx) => format(new Date(2000, idx, 1), 'MMM', { locale: ro }).replace('.', '')),
    []
  );
  const years = useMemo(() => {
    const base = getYear(pickerDate);
    return [base - 1, base, base + 1, base + 2];
  }, [pickerDate]);

  useEffect(() => {
    window.localStorage.setItem(MOBILE_RANGE_STORAGE_KEY, mobileRangeMode);
  }, [mobileRangeMode]);

  useEffect(() => {
    window.localStorage.setItem(MOBILE_SLOT_INTERVAL_STORAGE_KEY, String(mobileSlotInterval));
  }, [mobileSlotInterval]);

  useEffect(() => {
    window.localStorage.setItem(MOBILE_WORKING_HOURS_STORAGE_KEY, JSON.stringify(mobileWorkingHours));
  }, [mobileWorkingHours]);

  useEffect(() => {
    window.localStorage.setItem(MOBILE_VIEW_STORAGE_KEY, mobileView);
  }, [mobileView]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(DESKTOP_VIEW_STORAGE_KEY, desktopView);
  }, [desktopView]);

  useEffect(() => {
    window.localStorage.setItem(CALENDAR_COLUMN_MODE_STORAGE_KEY, calendarColumnMode);
  }, [calendarColumnMode]);

  useEffect(() => {
    if (!showDateDropdown) return;
    setPickerDate(state.currentDate);
  }, [showDateDropdown, state.currentDate]);

  useEffect(() => {
    const contactIdParam = searchParams.get('contactId');
    if (!contactIdParam) return;

    const contactId = Number(contactIdParam);
    if (!Number.isInteger(contactId) || contactId <= 0) return;
    if (handledContactPrefillRef.current === contactId) return;
    handledContactPrefillRef.current = contactId;

    const defaultStart = state.selectedSlot?.start
      ? new Date(state.selectedSlot.start)
      : (() => {
        const now = new Date();
        now.setHours(9, 0, 0, 0);
        return now;
      })();
    const defaultEnd = state.selectedSlot?.end
      ? new Date(state.selectedSlot.end)
      : new Date(defaultStart.getTime() + 30 * 60_000);

    if (!defaultCreateCalendar) {
      showErrorToast('Selectează un calendar pe care poți crea programări.');
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`/api/clients/${contactId}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Failed to fetch client');
        }
        const result = await response.json();
        const client = result?.client;
        if (!client) {
          throw new Error('Client not found');
        }

        const slot = { start: defaultStart, end: defaultEnd };
        actions.selectSlot(slot);
        setSelectedDay(slot.start);
        setAppointmentModalMode('create');
        setEditInitialData({
          clientId: client.id,
          clientName: client.name || '',
          clientEmail: client.email || '',
      clientPhone: client.phone || '',
      calendarId: defaultCreateCalendar?.id,
      calendarName: defaultCreateCalendar?.name,
      dentistUserId: undefined,
      dentistDisplayName: undefined,
      serviceIds: [],
      startTime: slot.start.toISOString(),
          endTime: slot.end.toISOString(),
          durationMinutes: Math.max(15, Math.round((slot.end.getTime() - slot.start.getTime()) / 60_000)),
          notes: '',
        });
        setShowCreateModal(true);
      } catch {
        showErrorToast('Nu am putut preîncărca datele pacientului pentru programare.');
      }
    })();
  }, [actions.selectSlot, defaultCreateCalendar?.id, defaultCreateCalendar?.name, searchParams, showErrorToast, state.selectedSlot]);

  // Drag-and-drop
  const { draggedAppointment, handleDragStart, handleDragEnd, handleDrop } = useDragAndDrop(
    async (appointmentId, newStartTime, newEndTime, context) => {
      const targetCalendar = typeof context?.calendarId === 'number'
        ? calendarMap.get(context.calendarId)
        : null;
      const targetCalendarId = targetCalendar && canCreateOnCalendar(targetCalendar)
        ? targetCalendar.id
        : undefined;
      const result = await updateAppointment(appointmentId, {
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
        ...(targetCalendarId ? { calendarId: targetCalendarId } : {}),
      });
      if (result.ok) {
        justDroppedRef.current = true;
        if (justDroppedTimeoutRef.current) {
          clearTimeout(justDroppedTimeoutRef.current);
        }
        justDroppedTimeoutRef.current = setTimeout(() => {
          justDroppedRef.current = false;
          justDroppedTimeoutRef.current = null;
        }, 100);
        if ((result.conflicts?.length || 0) > 0 || (result.suggestions?.length || 0) > 0) {
          toast.warning(result.warning || 'Programarea a fost mutata, dar intervalul se suprapune.');
        }
        toast.success('Programarea a fost mutata.');
        return true;
      }
      if (result.status === 409) {
        pendingRescheduleIdRef.current = appointmentId;
        setConflictData({
          conflicts: result.conflicts || [],
          suggestions: result.suggestions || [],
        });
        setShowConflictModal(true);
        toast.warning(result.error || 'Intervalul ales intra în conflict.');
        return false;
      }
      toast.error(result.error || 'Nu s-a putut muta programarea. Verifică conflictele.');
      return false;
    }
  );

  // Search filtering happens inside DayPanel — calendar views always show all appointments

  // Lazy-load services if not provided server-side
  useEffect(() => {
    if (initialServices.length > 0 || hasRequestedServicesRef.current) return;
    hasRequestedServicesRef.current = true;
    fetch('/api/services')
      .then((r) => r.json())
      .then((d) => setServices(d.services || []))
      .catch(() => showErrorToast('Eroare la încărcarea serviciilor.'));
  }, [initialServices.length, showErrorToast]);

  // ESC to close all modals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showDateDropdown) {
        setShowDateDropdown(false);
        return;
      }
      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
        return;
      }
      if (showConflictModal) {
        setShowConflictModal(false);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showConflictModal, showDateDropdown, showDeleteConfirm]);

  useEffect(() => {
    return () => {
      if (justDroppedTimeoutRef.current) {
        clearTimeout(justDroppedTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showDateDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!dateDropdownRef.current) return;
      if (!dateDropdownRef.current.contains(event.target as Node)) {
        setShowDateDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDateDropdown]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Select a day in the panel without opening the create modal */
  const handleDayHeaderClick = useEventCallback((day: Date) => {
    navigateToDate(day);
  });

  /** Click on an empty slot — selects day AND opens create modal */
  const openCreateAppointmentForSlot = useEventCallback((
    day: Date,
    hour?: number,
    minute: SlotMinute = 0,
    context?: { calendarId?: number }
  ) => {
    const contextCalendar = typeof context?.calendarId === 'number'
      ? calendarMap.get(context.calendarId) || null
      : null;
    const createCalendar = contextCalendar && canCreateOnCalendar(contextCalendar)
      ? contextCalendar
      : defaultCreateCalendar;
    if (!createCalendar) {
      toast.warning('Selectează un calendar pe care poți crea programări.');
      return;
    }
    setSelectedDay(day);
    const start = new Date(day);
    start.setHours(hour ?? 9, minute, 0, 0);
    const duration = 30;
    const end = new Date(start.getTime() + duration * 60_000);
    actions.selectSlot({ start, end });
    setAppointmentModalMode('create');
    setEditInitialData({
      clientName: '',
      clientEmail: '',
      clientPhone: '',
      calendarId: createCalendar.id,
      calendarName: createCalendar.name,
      dentistUserId: createCalendar.owner_user_id,
      dentistDisplayName: undefined,
      serviceIds: [],
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationMinutes: duration,
      notes: '',
    });
    setShowCreateModal(true);
  });

  const handleSlotClick = useEventCallback((
    day: Date,
    hour?: number,
    minute: SlotMinute = 0,
    context?: { calendarId?: number }
  ) => {
    if (justDroppedRef.current) {
      return;
    }
    openCreateAppointmentForSlot(day, hour, minute, context);
  });

  const buildAppointmentInitialData = (appointment: Appointment) => {
    const start = new Date(appointment.start_time);
    const end = new Date(appointment.end_time);
    const recurrence = appointment.recurrence;
    const recurrenceCount = recurrence?.count;
    const recurrenceEndType: 'date' | 'count' = recurrenceCount ? 'count' : 'date';

    return {
      clientId: appointment.client_id ?? null,
      clientName: appointment.client_name || '',
      clientEmail: appointment.client_email || '',
      clientPhone: appointment.client_phone || '',
      calendarId: appointment.calendar_id ?? undefined,
      calendarName: appointment.calendar_name || calendarMap.get(appointment.calendar_id || -1)?.name || undefined,
      dentistUserId: appointment.dentist_id ?? appointment.service_owner_user_id,
      dentistDisplayName: appointment.dentist_display_name || undefined,
      serviceNames: Array.isArray(appointment.service_names) && appointment.service_names.length > 0
        ? appointment.service_names
        : appointment.service_name
          ? [appointment.service_name]
          : [],
      serviceIds: Array.isArray(appointment.service_ids) && appointment.service_ids.length > 0
        ? appointment.service_ids.map((id: number) => String(id))
        : appointment.service_id
          ? [String(appointment.service_id)]
          : [],
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationMinutes: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000)),
      notes: appointment.notes || '',
      category: appointment.category || undefined,
      categoryLabel: appointment.category_label || undefined,
      categoryColor: appointment.category_color || undefined,
      color: appointment.color || undefined,
      status: appointment.status,
      isRecurring: Boolean(recurrence),
      recurrence: recurrence
        ? {
          frequency: recurrence.frequency,
          interval: Math.max(1, Number(recurrence.interval) || 1),
          endType: recurrenceEndType,
          endDate: recurrence.end_date || recurrence.endDate || '',
          count: recurrenceCount || 4,
        }
        : undefined,
    };
  };

  const openAppointmentDetails = async (appointment: Appointment) => {
    let nextAppointment = appointment;
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`);
      const result = await res.json();
      if (res.ok && result?.appointment) {
        nextAppointment = decorateAppointmentWithCalendarAccess(result.appointment, calendarMap, sessionDbUserId);
      }
    } catch {
      // Keep current appointment snapshot if details fetch fails.
    }

    actions.selectAppointment(nextAppointment);
    actions.selectSlot({
      start: new Date(nextAppointment.start_time),
      end: new Date(nextAppointment.end_time),
    });
    setEditInitialData(buildAppointmentInitialData(nextAppointment));
    setAppointmentModalMode('view');
    setShowCreateModal(true);
  };

  const handleAppointmentClick = useEventCallback((appointment: Appointment) => {
    if (justDroppedRef.current) return;
    void openAppointmentDetails(appointment);
  });

  const handleAvailabilityBlockClick = useEventCallback((block: AvailabilityBlock) => {
    toast.info(block.reason ? `${block.type_label}: ${block.reason}` : block.type_label);
  });

  const updateStatusWithUndo = async (appointment: Appointment, nextStatus: string) => {
    const previousStatus = appointment.status;
    if (previousStatus === nextStatus) {
      return;
    }

    const result = await updateAppointment(appointment.id, { status: nextStatus });
    if (!result.ok) {
      toast.error(result.error || 'Nu s-a putut actualiza statusul.');
      return;
    }

    actions.selectAppointment({ ...appointment, status: nextStatus });
    setEditInitialData((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    refetch();
    if (result.warning) {
      toast.warning(result.warning);
    }
    toast.success('Status schimbat.', {
      duration: 5000,
      actionLabel: 'Anulează',
      onAction: async () => {
        const undoResult = await updateAppointment(appointment.id, { status: previousStatus });
        if (!undoResult.ok) {
          toast.error(undoResult.error || 'Nu s-a putut reveni la statusul anterior.');
          return;
        }
        actions.selectAppointment({ ...appointment, status: previousStatus });
        setEditInitialData((prev) => (prev ? { ...prev, status: previousStatus } : prev));
        refetch();
        toast.info('Status restaurat.');
      },
    });
  };

  const handlePanelStatusChange = useEventCallback(async (appointmentId: number, status: string) => {
    const appointment = decoratedAppointments.find((item) => item.id === appointmentId);
    if (!appointment) {
      toast.error('Programarea nu a fost gasita.');
      return;
    }
    if (appointment.can_change_status === false) {
      toast.warning('Nu ai permisiunea să modifici această programare.');
      return;
    }

    try {
      if (status === 'cancelled') {
        setPendingCancelAppointment(appointment);
        return;
      }
      await updateStatusWithUndo(appointment, status);
    } catch {
      toast.error('Eroare la actualizarea statusului.');
    }
  });

  const handleCreateAppointment = async (formData: AppointmentModalData) => {
    if (!formData.clientName.trim() || formData.serviceIds.length === 0 || !formData.startTime || !formData.endTime) {
      toast.warning('Completeaza toate campurile obligatorii (nume pacient și serviciu).');
      return;
    }
    const serviceIdsNum = formData.serviceIds.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n));
    const targetCalendarId = formData.calendarId || defaultCreateCalendar?.id;
    if (!targetCalendarId) {
      toast.warning('Selectează un calendar pe care poți crea programări.');
      return;
    }
    if (formData.isRecurring && formData.recurrence) {
      try {
        const res = await fetch('/api/appointments/recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            calendarId: targetCalendarId,
            dentistUserId: formData.dentistUserId,
            serviceIds: serviceIdsNum,
            clientName: formData.clientName.trim(),
            clientId: formData.clientId,
            clientEmail: formData.clientEmail || undefined,
            clientPhone: formData.clientPhone || undefined,
            startTime: formData.startTime,
            endTime: formData.endTime,
            notes: formData.notes,
            category: formData.category,
            categoryId: formData.categoryId,
            color: formData.color,
            recurrence: {
              frequency: formData.recurrence.frequency,
              interval: formData.recurrence.interval,
              ...(formData.recurrence.endType === 'count'
                ? { count: formData.recurrence.count }
                : { endDate: formData.recurrence.endDate }),
            },
            forceNewClient: formData.forceNewClient,
          }),
        });
        const result = await res.json();
        if (res.ok) {
          setShowCreateModal(false);
          actions.clearSelection();
          refetch();
          if (result.warning) {
            toast.warning(result.warning);
          }
          toast.success(
            `${result.created} programări recurente create.`
          );
        } else {
          toast.error(result.error || 'Nu s-au putut crea programarile recurente.');
        }
      } catch {
        toast.error('Eroare la crearea programarilor recurente.');
      }
    } else {
      // Close the modal immediately so the dentist can move on — the server call
      // happens in the background. If it fails (rare), we re-open the modal with
      // the form data preserved and surface the error. This makes the common-case
      // create feel instant (~0ms perceived wait instead of ~250ms).
      const formSnapshot = formData;
      setShowCreateModal(false);
      actions.clearSelection();
      const ok = await createAppointment({
        calendarId: targetCalendarId,
        dentistUserId: formData.dentistUserId,
        serviceIds: serviceIdsNum,
        clientName: formData.clientName.trim(),
        clientId: formData.clientId,
        clientEmail: formData.clientEmail || undefined,
        clientPhone: formData.clientPhone || undefined,
        forceNewClient: formData.forceNewClient,
        startTime: formData.startTime,
        endTime: formData.endTime,
        notes: formData.notes,
        category: formData.category ?? undefined,
        categoryId: formData.categoryId,
        color: formData.color,
      });
      if (ok.ok) {
        if ((ok.conflicts?.length || 0) > 0 || (ok.suggestions?.length || 0) > 0) {
          toast.warning(ok.warning || 'Programarea a fost creata, dar intervalul se suprapune.');
        }
        const offHours = getOffHoursWarning(formData.startTime, formData.endTime, mobileWorkingHours);
        if (offHours) toast.warning(offHours);
        toast.success('Programarea a fost creata.');
      } else {
        // Re-open the modal so the user can retry without re-entering everything.
        setEditInitialData(formSnapshot);
        setAppointmentModalMode('create');
        setShowCreateModal(true);
        toast.error(ok.error || 'Nu s-a putut crea programarea.');
      }
    }
  };

  const handleEditClick = async () => {
    if (!state.selectedAppointment) return;
    if (state.selectedAppointment.can_edit === false) {
      toast.warning('Nu ai permisiunea să editezi această programare.');
      return;
    }
    let appointment = state.selectedAppointment;
    try {
      const res = await fetch(`/api/appointments/${state.selectedAppointment.id}`);
      const result = await res.json();
      if (res.ok && result?.appointment) {
        appointment = decorateAppointmentWithCalendarAccess(result.appointment, calendarMap, sessionDbUserId);
        actions.selectAppointment(appointment);
      }
    } catch {
      // proceed with existing data
    }
    const start = new Date(appointment.start_time);
    const end = new Date(appointment.end_time);
    actions.selectSlot({ start, end });
    setAppointmentModalMode('edit');
    setEditInitialData(buildAppointmentInitialData(appointment));
    setShowCreateModal(true);
  };

  const handleEditAppointment = async (formData: AppointmentModalData) => {
    if (!state.selectedAppointment || !formData.startTime || !formData.endTime) return;
    if (state.selectedAppointment.can_edit === false) {
      toast.warning('Nu ai permisiunea să editezi această programare.');
      return;
    }

    const newStart = new Date(formData.startTime);
    const newEnd = new Date(formData.endTime);
    // Compare arrays as JSON to detect any reorder / add / remove. Only send
    // serviceIds in the patch when the user actually changed something —
    // avoids a redundant DB write + service-validation round-trip.
    const existingServiceIds: string[] = Array.isArray(state.selectedAppointment.service_ids) &&
      state.selectedAppointment.service_ids.length > 0
        ? state.selectedAppointment.service_ids.map((id: number) => String(id))
        : state.selectedAppointment.service_id
          ? [String(state.selectedAppointment.service_id)]
          : [];
    const formServiceIds = formData.serviceIds;
    const didChangeService =
      formServiceIds.length > 0 && JSON.stringify(formServiceIds) !== JSON.stringify(existingServiceIds);
    const serviceIdsNum = formServiceIds.map((id) => parseInt(id, 10)).filter((n) => Number.isFinite(n));

    // Editing an existing recurring instance must NOT include recurrence config
    // in the payload. If we send `recurrence: {count: 4}` the backend treats
    // the request as a series regeneration anchored to this instance — which
    // ignores `scope: 'this'` and clobbers sibling occurrences (and can spawn
    // a phantom extra occurrence at the tail). Recurrence config is only
    // valid on initial create or when converting a non-recurring appointment.
    const isExistingRecurringInstance = Boolean(state.selectedAppointment.recurrence_group_id);

    try {
      const res = await fetch(`/api/appointments/${state.selectedAppointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
          dentistUserId: formData.dentistUserId,
          ...(didChangeService ? { serviceIds: serviceIdsNum } : {}),
          clientId: formData.clientId,
          clientName: formData.clientName.trim(),
          clientEmail: formData.clientEmail || undefined,
          clientPhone: formData.clientPhone || undefined,
          forceNewClient: formData.forceNewClient,
          notes: formData.notes,
          category: formData.category,
          categoryId: formData.categoryId,
          color: formData.color,
          status: formData.status,
          ...(isExistingRecurringInstance
            ? {}
            : {
                isRecurring: formData.isRecurring,
                recurrence: formData.isRecurring && formData.recurrence
                  ? {
                    frequency: formData.recurrence.frequency,
                    interval: formData.recurrence.interval,
                    ...(formData.recurrence.endType === 'count'
                      ? { count: formData.recurrence.count }
                      : { endDate: formData.recurrence.endDate }),
                  }
                  : null,
              }),
          // Recurrence edit scope: 'this' (default) or 'series'.
          // The modal's RecurrenceScopeModal sets this before submitting.
          ...(formData.scope ? { scope: formData.scope } : {}),
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setShowCreateModal(false);
        actions.clearSelection();
        refetch();
        if (result.warning) {
          toast.warning(result.warning);
        }
        const offHours = getOffHoursWarning(formData.startTime, formData.endTime, mobileWorkingHours);
        if (offHours) toast.warning(offHours);
        toast.success('Programarea a fost actualizata.');
      } else if (res.status === 409) {
        let conflicts = result.conflicts || [];
        let suggestions = result.suggestions || [];
        if ((!conflicts.length && !suggestions.length) && typeof result.details === 'string') {
          try {
            const parsed = JSON.parse(result.details);
            conflicts = parsed.conflicts || conflicts;
            suggestions = parsed.suggestions || suggestions;
          } catch {
            // Ignore invalid details format
          }
        }
        if (conflicts.length > 0 || suggestions.length > 0) {
          setConflictData({ conflicts, suggestions });
          setShowCreateModal(false);
          setShowConflictModal(true);
        } else {
          toast.error(result.error || 'Nu s-a putut actualiza programarea.');
        }
      } else {
        toast.error(result.error || 'Nu s-a putut actualiza programarea.');
      }
    } catch {
      toast.error('Eroare la actualizarea programarii.');
    }
  };

  const handleConfirmDelete = async (scope?: 'series') => {
    if (!state.selectedAppointment) return;
    if (state.selectedAppointment.can_delete === false) {
      toast.warning('Nu ai permisiunea să ștergi această programare.');
      return;
    }
    const result = await deleteAppointment(state.selectedAppointment.id, scope);
    if (result.ok) {
      setShowCreateModal(false);
      setShowDeleteConfirm(false);
      actions.clearSelection();
      toast.success(scope === 'series' ? 'Seria a fost ștearsă.' : 'Programarea a fost ștearsă.');
    } else {
      toast.error(result.error || 'Nu s-a putut șterge programarea.');
    }
  };

  const navigateToDate = (date: Date) => {
    setSelectedDay(date);
    actions.navigateToDate(date);
  };

  const handleMobileDaySelect = useEventCallback((date: Date) => {
    setSelectedDay(date);
    actions.navigateToDate(date);
  });

  // Stable wrappers for memoized children (WeekView, DayPanel).
  const handleDropStable = useEventCallback(async (
    day: Date,
    hour: number,
    minute?: 0 | 15 | 30 | 45,
    context?: { calendarId?: number }
  ) => {
    await handleDrop(day, hour, minute, context);
  });
  const handleCreateClickStable = useEventCallback(() => {
    handleSlotClick(selectedDay, 9);
  });
  const handleNavigateStable = useEventCallback((date: Date) => {
    navigateToDate(date);
  });

  const handleMobileViewToggle = () => {
    setMobileView((prev) => (prev === 'day' ? 'week' : 'day'));
  };

  const handleMobilePanelTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // Always wipe prior swipe state so a stale ref from an interrupted gesture
    // (multi-touch, scroll cancel, etc.) can't poison the next single-finger swipe.
    mobileSwipeAxisRef.current = null;
    mobileSwipeDeltaXRef.current = 0;
    setMobileSwipeDeltaX(0);
    if (e.touches.length !== 1) {
      mobileSwipeStartXRef.current = null;
      mobileSwipeStartYRef.current = null;
      return;
    }
    mobileSwipeStartXRef.current = e.touches[0].clientX;
    mobileSwipeStartYRef.current = e.touches[0].clientY;
  };

  const handleMobilePanelTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (mobileSwipeStartXRef.current === null || mobileSwipeStartYRef.current === null) return;
    const dx = e.touches[0].clientX - mobileSwipeStartXRef.current;
    const dy = e.touches[0].clientY - mobileSwipeStartYRef.current;
    if (mobileSwipeAxisRef.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        mobileSwipeAxisRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
    }
    if (mobileSwipeAxisRef.current === 'horizontal') {
      const damped = Math.sign(dx) * Math.min(Math.abs(dx), 200);
      mobileSwipeDeltaXRef.current = damped;
      setMobileSwipeDeltaX(damped);
    }
  };

  const handleMobilePanelTouchEnd = () => {
    const dx = mobileSwipeDeltaXRef.current;
    const wasHorizontal = mobileSwipeAxisRef.current === 'horizontal';
    mobileSwipeStartXRef.current = null;
    mobileSwipeStartYRef.current = null;
    mobileSwipeAxisRef.current = null;
    mobileSwipeDeltaXRef.current = 0;
    setMobileSwipeDeltaX(0);
    if (!wasHorizontal) return;
    const width = typeof window !== 'undefined' ? window.innerWidth : 360;
    const threshold = Math.min(80, width * 0.3);
    if (Math.abs(dx) > threshold) {
      if (dx < 0) {
        handleNextWeek();
      } else {
        handlePrevWeek();
      }
    }
  };

  const handleTodayClick = () => {
    const today = startOfLocalDay(new Date());
    setMobileRangeStartDate(today);
    navigateToDate(today);
    setShowDateDropdown(false);
  };

  const handlePrevWeek = () => {
    const rollingDayCount = getMobileRollingDayCount(mobileRangeMode);
    if (rollingDayCount) {
      const nextStart = addDays(mobileRangeStartDate, -rollingDayCount);
      setMobileRangeStartDate(nextStart);
      navigateToDate(nextStart);
      return;
    }

    const prevWeek = subWeeks(state.currentDate, 1);
    navigateToDate(prevWeek);
  };

  const handleNextWeek = () => {
    const rollingDayCount = getMobileRollingDayCount(mobileRangeMode);
    if (rollingDayCount) {
      const nextStart = addDays(mobileRangeStartDate, rollingDayCount);
      setMobileRangeStartDate(nextStart);
      navigateToDate(nextStart);
      return;
    }

    const nextWeek = addWeeks(state.currentDate, 1);
    navigateToDate(nextWeek);
  };

  const handleMobileRangeModeChange = (mode: MobileRangeMode) => {
    setMobileRangeMode(mode);
    if (mode === '3days' || mode === '5days' || mode === '7days') {
      const today = startOfLocalDay(new Date());
      setMobileRangeStartDate(today);
      navigateToDate(today);
    }
  };

  const updateMobileWorkingHour = (field: 'startHour' | 'endHour', value: string) => {
    const fallback = field === 'startHour' ? mobileWorkingHours.startHour : mobileWorkingHours.endHour;
    const nextHour = timeValueToHour(value, fallback);

    setMobileWorkingHours((current) => {
      if (field === 'startHour') {
        const nextStartHour = Math.min(nextHour, current.endHour - 1);
        return { ...current, startHour: nextStartHour };
      }

      const nextEndHour = Math.max(nextHour, current.startHour + 1);
      return { ...current, endHour: nextEndHour };
    });
  };

  const handlePickerDaySelect = (date: Date) => {
    if (getMobileRollingDayCount(mobileRangeMode)) {
      const nextStart = startOfLocalDay(date);
      setMobileRangeStartDate(nextStart);
      navigateToDate(nextStart);
      setShowDateDropdown(false);
      return;
    }

    navigateToDate(date);
    setShowDateDropdown(false);
  };

  const selectedCalendarValues = useMemo(
    () => visibleCalendarIds.map((id) => String(id)),
    [visibleCalendarIds]
  );

  const handleCalendarVisibilityToggle = (value: string) => {
    const nextCalendarId = Number.parseInt(value, 10);
    if (Number.isInteger(nextCalendarId) && nextCalendarId > 0 && calendarMap.has(nextCalendarId)) {
      setVisibleCalendarIds((current) =>
        current.includes(nextCalendarId)
          ? current.filter((id) => id !== nextCalendarId)
          : [...current, nextCalendarId]
      );
    }
  };

  const calendarScopeOptions = useMemo(
    () => [
      ...ownCalendars.map((calendar) => ({
        value: String(calendar.id),
        label: calendar.name,
        color: calendar.color_mine,
        group: 'own' as const,
      })),
      ...sharedCalendars.map((calendar) => ({
        value: String(calendar.id),
        label: calendar.sharedByName
          ? `${calendar.name} - ${calendar.sharedByName}`
          : calendar.name,
        color: calendar.color_mine,
        group: 'shared' as const,
      })),
    ],
    [ownCalendars, sharedCalendars]
  );

  const renderDateDropdown = ({
    className,
    hideSidePanel = false,
    hideTodayLink = false,
    showCalendarControls = false,
  }: {
    className?: string;
    hideSidePanel?: boolean;
    hideTodayLink?: boolean;
    showCalendarControls?: boolean;
  } = {}) => (
    <div className={showCalendarControls ? styles.dateDropdownWithControls : undefined}>
      {showCalendarControls && (
        <div className={styles.dateDropdownControls}>
          <div className={styles.desktopControlRow}>
            <div className={`${styles.desktopRangeSelector} ${styles.desktopViewSelector}`} aria-label="Mod afisare calendar">
              <button
                type="button"
                className={`${styles.desktopRangeOption} ${desktopView === 'week' ? styles.desktopRangeOptionActive : ''}`}
                onClick={() => setDesktopView('week')}
                aria-pressed={desktopView === 'week'}
              >
                Saptamana
              </button>
              <button
                type="button"
                className={`${styles.desktopRangeOption} ${desktopView === 'month' ? styles.desktopRangeOptionActive : ''}`}
                onClick={() => setDesktopView('month')}
                aria-pressed={desktopView === 'month'}
              >
                Luna
              </button>
            </div>

            <div className={`${styles.desktopRangeSelector} ${styles.desktopDaySelector}`} aria-label="Interval calendar">
              {MOBILE_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.desktopRangeOption} ${mobileRangeMode === option.value ? styles.desktopRangeOptionActive : ''}`}
                  onClick={() => handleMobileRangeModeChange(option.value)}
                  aria-pressed={mobileRangeMode === option.value}
                  disabled={desktopView === 'month'}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className={`${styles.desktopRangeSelector} ${styles.desktopSlotSelector}`} aria-label="Granularitate sloturi">
              {MOBILE_SLOT_INTERVAL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.desktopRangeOption} ${mobileSlotInterval === option.value ? styles.desktopRangeOptionActive : ''}`}
                  onClick={() => setMobileSlotInterval(option.value)}
                  aria-pressed={mobileSlotInterval === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.desktopWorkingHours} aria-label="Program de lucru dentist">
            <div className={styles.desktopWorkingHoursTitle}>Program dentist</div>
            <label className={styles.desktopWorkingHourField}>
              <span>Ora inceput</span>
              <input
                type="time"
                step="3600"
                value={hourToTimeValue(mobileWorkingHours.startHour)}
                max={hourToTimeValue(mobileWorkingHours.endHour - 1)}
                onClick={openNativeTimePicker}
                onFocus={openNativeTimePicker}
                onChange={(event) => updateMobileWorkingHour('startHour', event.target.value)}
              />
            </label>
            <label className={styles.desktopWorkingHourField}>
              <span>Ora final</span>
              <input
                type="time"
                step="3600"
                value={hourToTimeValue(mobileWorkingHours.endHour)}
                min={hourToTimeValue(mobileWorkingHours.startHour + 1)}
                onClick={openNativeTimePicker}
                onFocus={openNativeTimePicker}
                onChange={(event) => updateMobileWorkingHour('endHour', event.target.value)}
              />
            </label>
          </div>

          <div className={styles.desktopDensityControl} aria-label="Densitate calendar">
            <div className={styles.desktopDensityHeader}>
              <span>Densitate</span>
              <span>{effectiveDesktopHourHeight}px / ora</span>
            </div>
            <input
              className={styles.desktopDensitySlider}
              type="range"
              min={DESKTOP_HOUR_HEIGHT_BOUNDS.min}
              max={DESKTOP_HOUR_HEIGHT_BOUNDS.max}
              step={1}
              value={effectiveDesktopHourHeight}
              onChange={(event) => setDesktopHourHeight(Number(event.target.value))}
              aria-label="Ajusteaza densitatea calendarului"
            />
            <div className={styles.desktopDensityActions}>
              <button type="button" onClick={() => setDesktopHourHeight(DESKTOP_HOUR_HEIGHT_BOUNDS.min)}>
                Compact
              </button>
              <button type="button" onClick={fitDesktopDensity}>
                Incadreaza
              </button>
              <button type="button" onClick={resetDesktopDensity}>
                Normal
              </button>
              <button type="button" onClick={() => setDesktopHourHeight(DESKTOP_HOUR_HEIGHT_BOUNDS.max)}>
                Extins
              </button>
            </div>
          </div>
        </div>
      )}

      <CalendarDatePickerDropdown
        className={className}
        hideSidePanel={hideSidePanel}
        pickerDate={pickerDate}
        currentDate={state.currentDate}
        pickerMonthStart={pickerMonthStart}
        pickerWeeks={pickerWeeks}
        months={months}
        years={years}
        onPickerDateChange={setPickerDate}
        onDaySelect={handlePickerDaySelect}
        onTodayClick={handleTodayClick}
        hideTodayLink={hideTodayLink}
      />
    </div>
  );

  const weekToolbarControls = (
    <div className={styles.weekToolbar} ref={dateDropdownRef}>
      <button type="button" className={styles.todayButton} onClick={handleTodayClick}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>Astazi</span>
      </button>

      <div className={styles.weekArrows}>
        <button type="button" className={styles.navArrowButton} onClick={handlePrevWeek} aria-label="Saptamana anterioara">
          {'<'}
        </button>
        <button type="button" className={styles.navArrowButton} onClick={handleNextWeek} aria-label="Saptamana urmatoare">
          {'>'}
        </button>
      </div>

      <button
        type="button"
        className={styles.rangeButton}
        aria-expanded={showDateDropdown}
        onClick={() => setShowDateDropdown((prev) => !prev)}
      >
        <span>{weekRangeLabel}</span>
        <span className={styles.rangeChevron}>{showDateDropdown ? '\u25b2' : '\u25bc'}</span>
      </button>

      {showDateDropdown && renderDateDropdown({ showCalendarControls: true })}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  const calendarWithPanel = (
    <div className={styles.calendarWithPanel}>
      {desktopView === 'month' ? (
        <MonthView
          monthDays={monthDays}
          currentDate={state.currentDate}
          appointments={gridAppointments}
          availabilityBlocks={decoratedAvailabilityBlocks}
          selectedDay={selectedDay}
          viewerUserId={sessionUserId ?? null}
          onDayClick={(day) => {
            // Picking a day from the month grid drops the user into that
            // day's week view — same convention as Google / Apple Calendar.
            handleNavigateStable(day);
            setDesktopView('week');
          }}
          onAppointmentClick={handleAppointmentClick}
          onAvailabilityBlockClick={handleAvailabilityBlockClick}
        />
      ) : (
        <WeekView
          weekDays={visibleWeekDays}
          hours={visibleHours}
          appointments={gridAppointments}
          availabilityBlocks={decoratedAvailabilityBlocks}
          viewerUserId={sessionUserId ?? null}
          selectedDay={selectedDay}
          calendarColumns={weekCalendarColumns}
          onSlotClick={handleSlotClick}
          onDayHeaderClick={handleDayHeaderClick}
          onAppointmentClick={handleAppointmentClick}
          onAvailabilityBlockClick={handleAvailabilityBlockClick}
          enableDragDrop
          hoveredAppointmentId={hoveredAppointmentId}
          draggedAppointment={draggedAppointment}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDrop={handleDropStable}
          slotIntervalMinutes={mobileSlotInterval}
          hourHeightPx={effectiveDesktopHourHeight}
          minHourHeightPx={DESKTOP_HOUR_HEIGHT_BOUNDS.min}
          maxHourHeightPx={DESKTOP_HOUR_HEIGHT_BOUNDS.max}
          onHourHeightChange={setDesktopHourHeight}
        />
      )}

      <DayPanel
        topControls={weekToolbarControls}
        selectedDay={selectedDay}
        appointments={decoratedAppointments}
        viewerUserId={sessionUserId ?? null}
        onAppointmentClick={handleAppointmentClick}
        onQuickStatusChange={handlePanelStatusChange}
        onCreateClick={handleCreateClickStable}
        canCreate={canCreateAppointments}
        onNavigate={handleNavigateStable}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onHoverAppointment={setHoveredAppointmentId}
        calendarScopeValues={selectedCalendarValues}
        calendarScopeOptions={calendarScopeOptions}
        onCalendarScopeChange={handleCalendarVisibilityToggle}
        calendarColumnMode={calendarColumnMode}
        onCalendarColumnModeChange={setCalendarColumnMode}
      />
    </div>
  );

  const desktopCalendarView = calendarWithPanel;

  const mobileCalendarView = (
    <div className={styles.mobileCalendar}>
      {/* Row 1: Compact centered header — picker · month · today · view · search */}
      <div className={styles.mobileHeader} ref={dateDropdownRef}>
        <div className={styles.mobileHeaderCluster}>
          <button
            type="button"
            className={styles.mobileHeaderDateBtn}
            onClick={() => setShowDateDropdown((prev) => !prev)}
            aria-expanded={showDateDropdown}
          >
            <span>{mobileMonthLabel}</span>
            <span className={styles.rangeChevron}>{showDateDropdown ? '\u25b2' : '\u25bc'}</span>
          </button>

          <button
            type="button"
            className={`${styles.mobileHeaderIcon} ${!isTodayInMobileRange ? styles.mobileHeaderIconAccent : ''}`}
            onClick={handleTodayClick}
            aria-label="Astazi"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <circle cx="12" cy="15" r="2.2" fill="currentColor" stroke="none" />
            </svg>
          </button>

          <button
            type="button"
            className={styles.mobileHeaderIcon}
            onClick={handleMobileViewToggle}
            aria-label={mobileView === 'day' ? 'Vezi grila' : 'Vezi lista'}
            aria-pressed={mobileView === 'week'}
          >
            {mobileView === 'day' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="18" x2="20" y2="18" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className={styles.mobileHeaderIcon}
            onClick={() => setMobileSearchOpen(true)}
            aria-label="Caută programări"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>

        {showDateDropdown && (
          <div className={styles.mobileHeaderDateDropdown}>
            {calendarScopeOptions.length > 0 && (
              <CalendarScopeDropdown
                selectedValues={selectedCalendarValues}
                options={calendarScopeOptions}
                onChange={handleCalendarVisibilityToggle}
                columnMode={calendarColumnMode}
                onColumnModeChange={setCalendarColumnMode}
                className={styles.mobileScopePicker}
                triggerClassName={styles.mobileScopeTrigger}
                menuClassName={styles.mobileScopeMenu}
              />
            )}
            <div className={styles.mobileRangeSelector} aria-label="Interval calendar">
              {MOBILE_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.mobileRangeOption} ${mobileRangeMode === option.value ? styles.mobileRangeOptionActive : ''}`}
                  onClick={() => handleMobileRangeModeChange(option.value)}
                  aria-pressed={mobileRangeMode === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className={`${styles.mobileRangeSelector} ${styles.mobileSlotSelector}`} aria-label="Granularitate sloturi">
              {MOBILE_SLOT_INTERVAL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.mobileRangeOption} ${mobileSlotInterval === option.value ? styles.mobileRangeOptionActive : ''}`}
                  onClick={() => setMobileSlotInterval(option.value)}
                  aria-pressed={mobileSlotInterval === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className={styles.mobileWorkingHours} aria-label="Program de lucru dentist">
              <div className={styles.mobileWorkingHoursTitle}>Program dentist</div>
              <label className={styles.mobileWorkingHourField}>
                <span>Ora inceput</span>
                <input
                  type="time"
                  step="3600"
                  value={hourToTimeValue(mobileWorkingHours.startHour)}
                  max={hourToTimeValue(mobileWorkingHours.endHour - 1)}
                  onClick={openNativeTimePicker}
                  onFocus={openNativeTimePicker}
                  onChange={(event) => updateMobileWorkingHour('startHour', event.target.value)}
                />
              </label>
              <label className={styles.mobileWorkingHourField}>
                <span>Ora final</span>
                <input
                  type="time"
                  step="3600"
                  value={hourToTimeValue(mobileWorkingHours.endHour)}
                  min={hourToTimeValue(mobileWorkingHours.startHour + 1)}
                  onClick={openNativeTimePicker}
                  onFocus={openNativeTimePicker}
                  onChange={(event) => updateMobileWorkingHour('endHour', event.target.value)}
                />
              </label>
            </div>
            {renderDateDropdown({
              className: styles.mobileHeaderDateDropdownPicker,
              hideSidePanel: true,
              hideTodayLink: true,
            })}
          </div>
        )}
      </div>

      {/* Row 2: Day strip — leading time-gutter spacer aligns cells with grid columns when in week view */}
      <div
        className={`${styles.mobileDayStrip} ${mobileView === 'week' ? styles.mobileDayStripGridAligned : ''}`}
      >
        <div className={styles.mobileDayStripGutter} aria-hidden="true" />
        <div
          className={styles.mobileDayStripCells}
          style={{ gridTemplateColumns: `repeat(${mobileWeekDays.length}, minmax(0, 1fr))` }}
        >
          {mobileWeekDays.map((day) => {
            const isActive = isSameDay(day, selectedDay);
            const isTodayDay = isToday(day);
            const dayLabel = format(day, 'EEE', { locale: ro }).replace('.', '');
            const shortDayLabel = `${dayLabel.charAt(0).toUpperCase()}${dayLabel.slice(1, 3)}`;

            return (
              <button
                key={day.toISOString()}
                type="button"
                className={[
                  styles.mobileDayBtn,
                  isActive ? styles.mobileDayBtnActive : '',
                  isTodayDay ? styles.mobileDayBtnToday : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleMobileDaySelect(day)}
                aria-current={isTodayDay ? 'date' : undefined}
                aria-pressed={isActive}
              >
                <span className={styles.mobileDayBtnLabel}>{shortDayLabel}</span>
                <span className={styles.mobileDayBtnDigitWrap}>
                  <span className={styles.mobileDayBtnDigit}>{format(day, 'd')}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 3: Active panel only — horizontal swipe = prev/next period */}
      <div
        className={styles.mobileActivePanel}
        onTouchStart={handleMobilePanelTouchStart}
        onTouchMove={handleMobilePanelTouchMove}
        onTouchEnd={handleMobilePanelTouchEnd}
        onTouchCancel={handleMobilePanelTouchEnd}
        style={
          mobileSwipeDeltaX !== 0
            ? { transform: `translateX(${mobileSwipeDeltaX}px)`, transition: 'none' }
            : undefined
        }
      >
        {mobileView === 'day' ? (
          <div className={styles.mobileViewPanel}>
            {mobileDayAppointments.length === 0 && mobileDayBlocks.length === 0 ? (
              <div className={styles.mobileEmptyDay}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.3, marginBottom: '0.75rem' }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>Nicio programare</span>
                <span className={styles.mobileEmptyDaySub}>
                  {isToday(selectedDay) ? 'Astazi' : format(selectedDay, 'EEEE, d MMMM', { locale: ro })}
                </span>
              </div>
            ) : (
              <div className={styles.mobileAppointmentList}>
                {mobileDayBlocks.map((block) => (
                  <button
                    key={`block-${block.id}`}
                    type="button"
                    className={styles.mobileAvailabilityBlockCard}
                    onClick={() => handleAvailabilityBlockClick(block)}
                    title={`${block.type_label}${block.reason ? ` - ${block.reason}` : ''}`}
                  >
                    <span className={styles.mobileAvailabilityBlockMeta}>
                      {formatAvailabilityBlockTime(block)}
                    </span>
                    <span className={styles.mobileAvailabilityBlockTitle}>{block.type_label}</span>
                    {block.reason && (
                      <span className={styles.mobileAvailabilityBlockReason}>{block.reason}</span>
                    )}
                  </button>
                ))}
                {mobileDayAppointments.map((apt) => (
                  <AppointmentCard
                    key={apt.id}
                    appointment={apt}
                    viewerUserId={sessionUserId ?? null}
                    onClick={handleAppointmentClick}
                    onStatusChange={handlePanelStatusChange}
                    onHoverAppointment={setHoveredAppointmentId}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.mobileViewPanel}>
            <WeekView
              weekDays={mobileWeekDays}
              hours={mobileHours}
              appointments={gridAppointments}
              availabilityBlocks={decoratedAvailabilityBlocks}
              viewerUserId={sessionUserId ?? null}
              selectedDay={selectedDay}
              calendarColumns={weekCalendarColumns}
              onSlotClick={handleSlotClick}
              onDayHeaderClick={handleMobileDaySelect}
              onAppointmentClick={handleAppointmentClick}
              onAvailabilityBlockClick={handleAvailabilityBlockClick}
              enableDragDrop={false}
              hoveredAppointmentId={null}
              compact
              slotIntervalMinutes={mobileSlotInterval}
              hourHeightPx={effectiveMobileHourHeight}
              minHourHeightPx={MOBILE_HOUR_HEIGHT_BOUNDS.min}
              maxHourHeightPx={MOBILE_HOUR_HEIGHT_BOUNDS.max}
              onHourHeightChange={setMobileHourHeight}
              autoScrollToNow={false}
            />
          </div>
        )}
      </div>

      {/* Layer 4: FAB */}
      <button
        type="button"
        className={styles.mobileFab}
        aria-label="Adaugă programare"
        onClick={() => handleSlotClick(selectedDay, 9, 0)}
        disabled={!canCreateAppointments}
      >
        <svg
          className={styles.mobileFabIcon}
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Search overlay */}
      {mobileSearchOpen && (
        <div className={styles.mobileSearchOverlay}>
          <div className={styles.mobileSearchHeader}>
            <button
              type="button"
              className={styles.mobileHeaderIcon}
              onClick={() => {
                setMobileSearchOpen(false);
                setMobileSearchQuery('');
              }}
              aria-label="Închide căutarea"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className={styles.mobileSearchInputWrapper}>
              <input
                ref={mobileSearchInputRef}
                type="text"
                className={styles.mobileSearchInput}
                placeholder="Caută programări..."
                value={mobileSearchQuery}
                onChange={(e) => setMobileSearchQuery(e.target.value)}
                autoComplete="off"
              />
              {mobileSearchQuery && (
                <button
                  type="button"
                  className={styles.mobileSearchClear}
                  onClick={() => setMobileSearchQuery('')}
                  aria-label="Șterge căutarea"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className={styles.mobileSearchResults}>
            {mobileSearchQuery.trim() === '' ? (
              <div className={styles.mobileEmptyDay}>
                <span style={{ opacity: 0.5 }}>Scrie pentru a caută...</span>
              </div>
            ) : mobileSearchResults.length === 0 ? (
              <div className={styles.mobileEmptyDay}>
                <span>Niciun rezultat pentru &ldquo;{mobileSearchQuery}&rdquo;</span>
              </div>
            ) : (
              <div className={styles.mobileAppointmentList}>
                {mobileSearchResults.map((apt) => {
                  const aptDate = new Date(apt.start_time);
                  const dateLabel = isToday(aptDate)
                    ? 'Astazi'
                    : format(aptDate, 'EEEE, d MMM', { locale: ro });
                  return (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      viewerUserId={sessionUserId ?? null}
                      onClick={(a) => {
                        handleAppointmentClick(a);
                        setMobileSearchOpen(false);
                        setMobileSearchQuery('');
                      }}
                      onStatusChange={handlePanelStatusChange}
                      dateLabel={dateLabel}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Server-side loading.tsx covers the initial RSC fetch window.
  // No client-side skeleton fallback — avoids the cascaded skeleton flash.

  if (asistentReassignState) {
    return (
      <div
        ref={containerRef}
        className={styles.container}
        style={
          // On mobile the container is pinned via `position: fixed` in CSS
          // (see .container under @media (max-width: 640px)). Setting an inline
          // height here would override that and re-introduce the scroll bug.
          isMobile ? undefined : availableHeight ? { height: `${availableHeight}px` } : undefined
        }
      >
        <main className={styles.main}>
          <AsistentReassignBanner state={asistentReassignState} />
        </main>
      </div>
    );
  }

  const selectedAppointmentClientId =
    state.selectedAppointment?.client_id ??
    editInitialData?.clientId ??
    null;
  const patientProfileHref =
    appointmentModalMode === 'view' && selectedAppointmentClientId
      ? `/clients/${selectedAppointmentClientId}`
      : null;
  const selectedAppointmentCalendar = calendarOptions.find(
    (calendar) => calendar.id === state.selectedAppointment?.calendar_id
  );
  const newTreatmentPlanHref =
    appointmentModalMode === 'view' && selectedAppointmentClientId && state.selectedAppointment?.id
      && selectedAppointmentCalendar?.isOwn !== false
      ? `/clients/${selectedAppointmentClientId}?tab=plan&newPlan=1&appointmentId=${state.selectedAppointment.id}`
      : null;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={
        // Mobile uses position:fixed in CSS (see .container under @media (max-width: 640px));
        // inline height would clobber that and re-introduce the header-scrolls-with-list bug.
        isMobile ? undefined : availableHeight ? { height: `${availableHeight}px` } : undefined
      }
    >
      <main className={styles.main}>
        <RoleMigrationBanner userId={sessionUserId} />
        {isMobile ? mobileCalendarView : desktopCalendarView}
      </main>

      <AppointmentModal
        isOpen={showCreateModal}
        selectedSlot={state.selectedSlot}
        services={services}
        calendarOptions={calendarOptions}
        activeCalendarId={editInitialData?.calendarId || selectedCalendar?.id || defaultCreateCalendar?.id || null}
        lockCalendarSelection={appointmentModalMode !== 'create'}
        currentUserId={sessionUserId}
        currentUserDbUserId={sessionDbUserId || null}
        mode={appointmentModalMode}
        title={
          appointmentModalMode === 'view'
            ? 'Detalii programare'
            : appointmentModalMode === 'edit'
              ? 'Editează programare'
              : 'Creeaza programare'
        }
        submitLabel={appointmentModalMode === 'edit' ? 'Salvează modificarile' : 'Salvează'}
        allowRecurring={appointmentModalMode !== 'view'}
        initialData={editInitialData}
        onModeChange={setAppointmentModalMode}
        patientProfileHref={patientProfileHref}
        newTreatmentPlanHref={newTreatmentPlanHref}
        appointmentStatus={editInitialData?.status || state.selectedAppointment?.status}
        appointmentId={state.selectedAppointment?.id}
        canChangeStatus={state.selectedAppointment?.can_change_status !== false}
        onStatusChange={handlePanelStatusChange}
        canEdit={state.selectedAppointment?.can_edit !== false}
        canDelete={state.selectedAppointment?.can_delete !== false}
        isRecurringInstance={Boolean(state.selectedAppointment?.recurrence_group_id)}
        onDelete={appointmentModalMode === 'view' ? () => {
          setShowCreateModal(false);
          setShowDeleteConfirm(true);
        } : undefined}
        onClose={() => {
          setShowCreateModal(false);
          setAppointmentModalMode('create');
          setEditInitialData(null);
          actions.clearSelection();
        }}
        onSubmit={appointmentModalMode === 'edit' ? handleEditAppointment : handleCreateAppointment}
      />

      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        appointment={state.selectedAppointment}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
      />

      <DeleteConfirmModal
        isOpen={Boolean(pendingCancelAppointment)}
        appointment={pendingCancelAppointment}
        onConfirm={async () => {
          const apt = pendingCancelAppointment;
          setPendingCancelAppointment(null);
          if (!apt) return;
          await updateStatusWithUndo(apt, 'cancelled');
        }}
        onClose={() => setPendingCancelAppointment(null)}
      />

      <ConflictWarningModal
        isOpen={showConflictModal}
        conflicts={conflictData.conflicts}
        suggestions={conflictData.suggestions}
        onClose={() => {
          pendingRescheduleIdRef.current = null;
          setShowConflictModal(false);
        }}
        onSelectSlot={async (startTime, endTime) => {
          setShowConflictModal(false);

          if (pendingRescheduleIdRef.current !== null) {
            const id = pendingRescheduleIdRef.current;
            pendingRescheduleIdRef.current = null;
            const result = await updateAppointment(id, { startTime, endTime });
            if (result.ok) {
              refetch();
              toast.success('Programarea a fost mutata.');
            } else if (result.status === 409) {
              pendingRescheduleIdRef.current = id;
              setConflictData({
                conflicts: result.conflicts || [],
                suggestions: result.suggestions || [],
              });
              setShowConflictModal(true);
              toast.warning(result.error || 'Intervalul ales intra în conflict.');
            } else {
              toast.error(result.error || 'Nu s-a putut muta programarea.');
            }
            return;
          }

          actions.selectSlot({ start: new Date(startTime), end: new Date(endTime) });
          setEditInitialData((prev) =>
            prev
              ? {
                  ...prev,
                  startTime,
                  endTime,
                  durationMinutes: Math.max(
                    15,
                    Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000)
                  ),
                }
              : prev
          );
          setAppointmentModalMode('edit');
          setShowCreateModal(true);
        }}
      />

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
