import { useReducer, useCallback } from 'react';
import { addWeeks, subWeeks, addMonths, subMonths, addDays, subDays } from 'date-fns';

interface Appointment {
  id: number;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  service_name: string;
  start_time: string;
  end_time: string;
  status: string;
  notes?: string;
  provider_id?: number;
  resource_id?: number;
  category?: string;
  color?: string;
}

interface Provider {
  id: number;
  name: string;
  email?: string;
  role?: string;
  color: string;
}

interface Resource {
  id: number;
  name: string;
  type: 'chair' | 'room' | 'equipment';
}

interface CalendarState {
  viewType: 'week' | 'month' | 'day';
  currentDate: Date;
  selectedDate: Date | null;
  selectedAppointment: Appointment | null;
  selectedProvider: Provider | null;
  selectedResource: Resource | null;
  selectedSlot: { start: Date; end: Date } | null;
}

type CalendarAction =
  | { type: 'SET_VIEW_TYPE'; payload: 'week' | 'month' | 'day' }
  | { type: 'SET_CURRENT_DATE'; payload: Date }
  | { type: 'SET_SELECTED_DATE'; payload: Date | null }
  | { type: 'SET_SELECTED_APPOINTMENT'; payload: Appointment | null }
  | { type: 'SET_SELECTED_PROVIDER'; payload: Provider | null }
  | { type: 'SET_SELECTED_RESOURCE'; payload: Resource | null }
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

    case 'SET_SELECTED_DATE':
      return { ...state, selectedDate: action.payload };

    case 'SET_SELECTED_APPOINTMENT':
      return { ...state, selectedAppointment: action.payload };

    case 'SET_SELECTED_PROVIDER':
      return { ...state, selectedProvider: action.payload };

    case 'SET_SELECTED_RESOURCE':
      return { ...state, selectedResource: action.payload };

    case 'SET_SELECTED_SLOT':
      return { ...state, selectedSlot: action.payload };

    case 'GO_TO_TODAY':
      return { ...state, currentDate: new Date() };

    case 'NEXT_PERIOD':
      return {
        ...state,
        currentDate:
          state.viewType === 'day'   ? addDays(state.currentDate, 1)
          : state.viewType === 'week' ? addWeeks(state.currentDate, 1)
          : addMonths(state.currentDate, 1),
      };

    case 'PREV_PERIOD':
      return {
        ...state,
        currentDate:
          state.viewType === 'day'   ? subDays(state.currentDate, 1)
          : state.viewType === 'week' ? subWeeks(state.currentDate, 1)
          : subMonths(state.currentDate, 1),
      };

    case 'CLEAR_SELECTION':
      return { ...state, selectedDate: null, selectedAppointment: null, selectedSlot: null };

    default:
      return state;
  }
}

interface UseCalendarResult {
  state: CalendarState;
  actions: {
    setViewType: (view: 'week' | 'month' | 'day') => void;
    navigateToDate: (date: Date) => void;
    goToToday: () => void;
    nextPeriod: () => void;
    prevPeriod: () => void;
    selectAppointment: (appointment: Appointment | null) => void;
    selectDate: (date: Date | null) => void;
    selectSlot: (slot: { start: Date; end: Date } | null) => void;
    selectProvider: (provider: Provider | null) => void;
    selectResource: (resource: Resource | null) => void;
    clearSelection: () => void;
  };
}

export function useCalendar(
  initialDate: string = new Date().toISOString(),
  initialViewType: 'week' | 'month' | 'day' = 'week'
): UseCalendarResult {
  const [state, dispatch] = useReducer(calendarReducer, {
    viewType: initialViewType,
    currentDate: new Date(initialDate),
    selectedDate: null,
    selectedAppointment: null,
    selectedProvider: null,
    selectedResource: null,
    selectedSlot: null,
  });

  const actions = {
    setViewType: useCallback((view: 'week' | 'month' | 'day') => {
      dispatch({ type: 'SET_VIEW_TYPE', payload: view });
    }, []),
    navigateToDate: useCallback((date: Date) => {
      dispatch({ type: 'SET_CURRENT_DATE', payload: date });
    }, []),
    goToToday:      useCallback(() => dispatch({ type: 'GO_TO_TODAY' }), []),
    nextPeriod:     useCallback(() => dispatch({ type: 'NEXT_PERIOD' }), []),
    prevPeriod:     useCallback(() => dispatch({ type: 'PREV_PERIOD' }), []),
    selectAppointment: useCallback((a: Appointment | null) => dispatch({ type: 'SET_SELECTED_APPOINTMENT', payload: a }), []),
    selectDate:     useCallback((d: Date | null) => dispatch({ type: 'SET_SELECTED_DATE', payload: d }), []),
    selectSlot:     useCallback((s: { start: Date; end: Date } | null) => dispatch({ type: 'SET_SELECTED_SLOT', payload: s }), []),
    selectProvider: useCallback((p: Provider | null) => dispatch({ type: 'SET_SELECTED_PROVIDER', payload: p }), []),
    selectResource: useCallback((r: Resource | null) => dispatch({ type: 'SET_SELECTED_RESOURCE', payload: r }), []),
    clearSelection: useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), []),
  };

  return { state, actions };
}

export type { Appointment, Provider, Resource, CalendarState };
