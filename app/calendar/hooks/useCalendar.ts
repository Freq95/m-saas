import { useReducer, useCallback, useEffect, useMemo } from 'react';
import { addWeeks, subWeeks, addMonths, subMonths, addDays, subDays } from 'date-fns';
import type { CalendarColorMode } from '@/lib/calendar-color-policy';

export type CalendarViewType = 'week' | 'workweek' | 'month' | 'day';

export interface CalendarPermissions {
  can_view: boolean;
  can_create: boolean;
  can_edit_own: boolean;
  can_edit_all: boolean;
  can_delete_own: boolean;
  can_delete_all: boolean;
}

export interface AppointmentCalendarSettings {
  color_mode?: CalendarColorMode;
}

interface Appointment {
  id: number;
  service_id?: number;
  service_owner_user_id?: number;
  client_id?: number;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  service_name: string;
  start_time: string;
  end_time: string;
  status: string;
  notes?: string;
  category?: string;
  color?: string;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval?: number;
    end_date?: string;
    endDate?: string;
    count?: number;
  } | null;
  recurrence_group_id?: number;
  calendar_id?: number | null;
  created_by_user_id?: string | null;
  dentist_db_user_id?: string | null;
  dentist_display_name?: string | null;
  calendar_name?: string | null;
  calendar_color?: string | null;
  calendar_is_default?: boolean | null;
  calendar_settings?: AppointmentCalendarSettings | null;
  dentist_color?: string | null;
  can_edit?: boolean;
  can_delete?: boolean;
  can_drag?: boolean;
  can_change_status?: boolean;
}

interface CalendarState {
  viewType: CalendarViewType;
  currentDate: Date;
  selectedAppointment: Appointment | null;
  selectedSlot: { start: Date; end: Date } | null;
}

type CalendarAction =
  | { type: 'SET_VIEW_TYPE'; payload: CalendarViewType }
  | { type: 'SET_CURRENT_DATE'; payload: Date }
  | { type: 'SET_SELECTED_APPOINTMENT'; payload: Appointment | null }
  | { type: 'SET_SELECTED_SLOT'; payload: { start: Date; end: Date } | null }
  | { type: 'GO_TO_TODAY' }
  | { type: 'NEXT_PERIOD' }
  | { type: 'PREV_PERIOD' }
  | { type: 'CLEAR_SELECTION' };

function calendarReducer(state: CalendarState, action: CalendarAction): CalendarState {
  switch (action.type) {
    case 'SET_VIEW_TYPE':
      return { ...state, viewType: action.payload };

    case 'SET_CURRENT_DATE':
      return { ...state, currentDate: action.payload };

    case 'SET_SELECTED_APPOINTMENT':
      return { ...state, selectedAppointment: action.payload };

    case 'SET_SELECTED_SLOT':
      return { ...state, selectedSlot: action.payload };

    case 'GO_TO_TODAY':
      return { ...state, currentDate: new Date() };

    case 'NEXT_PERIOD':
      return {
        ...state,
        currentDate:
          state.viewType === 'day'
            ? addDays(state.currentDate, 1)
            : state.viewType === 'week' || state.viewType === 'workweek'
              ? addWeeks(state.currentDate, 1)
              : addMonths(state.currentDate, 1),
      };

    case 'PREV_PERIOD':
      return {
        ...state,
        currentDate:
          state.viewType === 'day'
            ? subDays(state.currentDate, 1)
            : state.viewType === 'week' || state.viewType === 'workweek'
              ? subWeeks(state.currentDate, 1)
              : subMonths(state.currentDate, 1),
      };

    case 'CLEAR_SELECTION':
      return { ...state, selectedAppointment: null, selectedSlot: null };

    default:
      return state;
  }
}

interface UseCalendarResult {
  state: CalendarState;
  actions: {
    setViewType: (view: CalendarViewType) => void;
    navigateToDate: (date: Date) => void;
    goToToday: () => void;
    nextPeriod: () => void;
    prevPeriod: () => void;
    selectAppointment: (appointment: Appointment | null) => void;
    selectSlot: (slot: { start: Date; end: Date } | null) => void;
    clearSelection: () => void;
  };
}

export function useCalendar(
  initialDate: string = new Date().toISOString(),
  initialViewType: CalendarViewType = 'week'
): UseCalendarResult {
  const [state, dispatch] = useReducer(calendarReducer, {
    viewType: initialViewType,
    currentDate: new Date(initialDate),
    selectedAppointment: null,
    selectedSlot: null,
  });

  const setViewType = useCallback((view: CalendarViewType) => {
    dispatch({ type: 'SET_VIEW_TYPE', payload: view });
  }, []);
  const navigateToDate = useCallback((date: Date) => {
    dispatch({ type: 'SET_CURRENT_DATE', payload: date });
  }, []);
  const goToToday = useCallback(() => dispatch({ type: 'GO_TO_TODAY' }), []);
  const nextPeriod = useCallback(() => dispatch({ type: 'NEXT_PERIOD' }), []);
  const prevPeriod = useCallback(() => dispatch({ type: 'PREV_PERIOD' }), []);
  const selectAppointment = useCallback((a: Appointment | null) => dispatch({ type: 'SET_SELECTED_APPOINTMENT', payload: a }), []);
  const selectSlot = useCallback((s: { start: Date; end: Date } | null) => dispatch({ type: 'SET_SELECTED_SLOT', payload: s }), []);
  const clearSelection = useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), []);

  const actions = useMemo(() => ({
    setViewType,
    navigateToDate,
    goToToday,
    nextPeriod,
    prevPeriod,
    selectAppointment,
    selectSlot,
    clearSelection,
  }), [
    setViewType,
    navigateToDate,
    goToToday,
    nextPeriod,
    prevPeriod,
    selectAppointment,
    selectSlot,
    clearSelection,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const persistedView = localStorage.getItem('calendar:viewType');
    if (
      persistedView === 'week' ||
      persistedView === 'workweek' ||
      persistedView === 'month' ||
      persistedView === 'day'
    ) {
      dispatch({ type: 'SET_VIEW_TYPE', payload: persistedView });
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem('calendar:viewType', state.viewType);
  }, [state.viewType]);

  return { state, actions };
}

export type { Appointment, CalendarState };
