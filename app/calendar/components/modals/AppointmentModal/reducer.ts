import type { RecurrenceForm } from './types';

export interface AppointmentFormState {
  calendarId: string;
  dentistUserId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  /** If set, the typed name has been linked to an existing client. */
  selectedClientId: number | null;
  /** User has explicitly decided to ignore any matches and create a new record. */
  forceNewClient: boolean;
  serviceId: string;
  category: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  status: string;
  isRecurring: boolean;
  recurrence: RecurrenceForm;
  error: string | null;
}

const DEFAULT_RECURRENCE: RecurrenceForm = {
  frequency: 'weekly',
  interval: 1,
  endType: 'count',
  endDate: '',
  count: 4,
};

const DEFAULT_DURATION_MINUTES = 30;

export type AppointmentFormAction =
  | { type: 'RESET'; payload: AppointmentFormState }
  | { type: 'SET_FIELD'; field: keyof AppointmentFormState; value: string | boolean }
  | { type: 'SET_CALENDAR'; calendarId: string }
  | { type: 'SET_DENTIST'; dentistUserId: string }
  | { type: 'RESET_SERVICE' }
  | { type: 'SET_SERVICE'; serviceId: string; durationMinutes?: number }
  | { type: 'SET_CATEGORY'; category: string }
  | { type: 'SET_CLIENT_NAME'; value: string }
  | { type: 'APPLY_CLIENT_SUGGESTION'; clientId: number; name: string; email: string | null; phone: string | null }
  | { type: 'CLEAR_CLIENT_LINK' }
  | { type: 'SET_TIME'; date?: string; startTime?: string; endTime?: string }
  | { type: 'SET_RECURRENCE'; patch: Partial<RecurrenceForm> }
  | { type: 'SET_IS_RECURRING'; value: boolean }
  | { type: 'SET_ERROR'; error: string | null };

function addMinutesToTime(time: string, deltaMin: number): string {
  const [hStr, mStr] = time.split(':');
  const h = Number.parseInt(hStr, 10);
  const m = Number.parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const total = Math.max(0, Math.min(23 * 60 + 59, h * 60 + m + deltaMin));
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function appointmentFormReducer(
  state: AppointmentFormState,
  action: AppointmentFormAction
): AppointmentFormState {
  switch (action.type) {
    case 'RESET':
      return action.payload;

    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };

    case 'SET_CALENDAR':
      // Dentist, service, and linked client all belong to the selected calendar scope.
      return {
        ...state,
        calendarId: action.calendarId,
        dentistUserId: '',
        serviceId: '',
        clientName: '',
        clientEmail: '',
        clientPhone: '',
        selectedClientId: null,
        forceNewClient: false,
      };

    case 'SET_DENTIST':
      // Changing dentist resets service and client — both are dentist-scoped
      return {
        ...state,
        dentistUserId: action.dentistUserId,
        serviceId: '',
        clientName: '',
        clientEmail: '',
        clientPhone: '',
        selectedClientId: null,
        forceNewClient: false,
      };

    case 'RESET_SERVICE':
      return { ...state, serviceId: '' };

    case 'SET_SERVICE': {
      const next: AppointmentFormState = { ...state, serviceId: action.serviceId };
      if (action.durationMinutes && state.startTime) {
        next.endTime = addMinutesToTime(state.startTime, action.durationMinutes);
      }
      return next;
    }

    case 'SET_CATEGORY':
      return { ...state, category: action.category };

    case 'SET_CLIENT_NAME': {
      // Editing the name breaks any previous explicit link.
      const cleared = state.selectedClientId !== null || state.forceNewClient;
      return {
        ...state,
        clientName: action.value,
        ...(cleared ? { selectedClientId: null, forceNewClient: false } : {}),
      };
    }

    case 'APPLY_CLIENT_SUGGESTION':
      return {
        ...state,
        selectedClientId: action.clientId,
        forceNewClient: false,
        clientName: action.name,
        clientEmail: action.email || state.clientEmail,
        clientPhone: action.phone || state.clientPhone,
      };

    case 'CLEAR_CLIENT_LINK':
      return { ...state, selectedClientId: null, forceNewClient: false };

    case 'SET_TIME': {
      const next = { ...state };
      if (action.date !== undefined) next.date = action.date;
      if (action.startTime !== undefined) {
        next.startTime = action.startTime;
        // If end time is now <= start, push it forward by 30m
        if (next.endTime && next.endTime <= action.startTime) {
          next.endTime = addMinutesToTime(action.startTime, DEFAULT_DURATION_MINUTES);
        }
      }
      if (action.endTime !== undefined) next.endTime = action.endTime;
      return next;
    }

    case 'SET_RECURRENCE':
      return {
        ...state,
        recurrence: { ...state.recurrence, ...action.patch },
      };

    case 'SET_IS_RECURRING':
      return { ...state, isRecurring: action.value };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    default:
      return state;
  }
}

export function buildInitialState(args: {
  initialData?: Partial<{
    calendarId?: number;
    dentistUserId?: number;
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    clientId?: number | null;
    serviceId: string;
    category?: string | null;
    startTime: string;
    endTime: string;
    notes: string;
    status?: string;
    isRecurring?: boolean;
    recurrence?: Partial<RecurrenceForm>;
  }>;
  selectedSlot?: { start: Date; end: Date } | null;
  fallbackCalendarId?: number | null;
}): AppointmentFormState {
  const { initialData, selectedSlot, fallbackCalendarId } = args;

  const startDate = initialData?.startTime
    ? new Date(initialData.startTime)
    : selectedSlot?.start || null;
  const endDate = initialData?.endTime
    ? new Date(initialData.endTime)
    : selectedSlot?.end ||
      (startDate ? new Date(startDate.getTime() + DEFAULT_DURATION_MINUTES * 60_000) : null);

  const toDateStr = (d: Date | null): string => {
    if (!d || Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const toTimeStr = (d: Date | null): string => {
    if (!d || Number.isNaN(d.getTime())) return '';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const calendarId =
    typeof initialData?.calendarId === 'number'
      ? String(initialData.calendarId)
      : typeof fallbackCalendarId === 'number'
        ? String(fallbackCalendarId)
        : '';

  return {
    calendarId,
    dentistUserId:
      typeof initialData?.dentistUserId === 'number' ? String(initialData.dentistUserId) : '',
    clientName: initialData?.clientName || '',
    clientEmail: initialData?.clientEmail || '',
    clientPhone: initialData?.clientPhone || '',
    selectedClientId:
      typeof initialData?.clientId === 'number' ? initialData.clientId : null,
    forceNewClient: false,
    serviceId: initialData?.serviceId || '',
    category: initialData?.category || '',
    date: toDateStr(startDate),
    startTime: toTimeStr(startDate),
    endTime: toTimeStr(endDate),
    notes: initialData?.notes || '',
    status: initialData?.status || 'scheduled',
    isRecurring: Boolean(initialData?.isRecurring),
    recurrence: { ...DEFAULT_RECURRENCE, ...(initialData?.recurrence || {}) },
    error: null,
  };
}

// Pure derived helpers
export function composeIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const next = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(next.getTime()) ? null : next.toISOString();
}

export function computeDurationMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(sm)) return DEFAULT_DURATION_MINUTES;
  if (!Number.isFinite(eh) || !Number.isFinite(em)) return DEFAULT_DURATION_MINUTES;
  return Math.max(15, eh * 60 + em - (sh * 60 + sm));
}

export function validate(state: AppointmentFormState): string | null {
  if (!state.calendarId) return 'Selecteaza un calendar.';
  if (!state.clientName.trim()) return 'Completeaza numele clientului.';
  if (!state.serviceId) return 'Selecteaza un serviciu.';
  if (!state.date || !state.startTime || !state.endTime) return 'Completeaza data si ora.';
  if (state.startTime >= state.endTime) return 'Ora de final trebuie sa fie dupa ora de inceput.';
  if (state.isRecurring) {
    if (state.recurrence.interval < 1) return 'Intervalul de recurenta trebuie sa fie minim 1.';
    if (state.recurrence.endType === 'count' && state.recurrence.count < 1) {
      return 'Numarul de repetari trebuie sa fie minim 1.';
    }
    if (state.recurrence.endType === 'date' && !state.recurrence.endDate) {
      return 'Selecteaza data la care se opreste recurenta.';
    }
  }
  return null;
}
