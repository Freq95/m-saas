export interface AppointmentService {
  id: number;
  name: string;
  duration_minutes: number;
  price: number;
}

export interface CalendarOption {
  id: number;
  name: string;
  color: string;
  description?: string;
  disabled?: boolean;
  /** True when the calendar is owned by the current user (personal). */
  isOwn?: boolean;
}

export interface ClientSuggestion {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface DentistOption {
  userId: number;
  dbUserId: string;
  displayName: string;
  isOwner: boolean;
  isCurrentUser: boolean;
}

export type AppointmentModalMode = 'create' | 'edit' | 'view';

export interface RecurrenceForm {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  endType: 'date' | 'count';
  endDate: string;
  count: number;
}

export interface AppointmentFormPayload {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  calendarId?: number;
  calendarName?: string;
  dentistUserId?: number;
  dentistDisplayName?: string;
  serviceId: string;
  serviceName?: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes: string;
  status?: string;
  category?: string | null;
  color?: string;
  forceNewClient?: boolean;
  clientId?: number | null;
  isRecurring?: boolean;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endType: 'date' | 'count';
    endDate?: string;
    count?: number;
  };
}

export interface AppointmentInitialData extends Partial<AppointmentFormPayload> {}
