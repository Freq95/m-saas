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
  /** True for the auto-created personal calendar where categories apply. */
  isDefault?: boolean;
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
  /** Multi-service: array of service IDs (as strings — they're rendered in form state). */
  serviceIds: string[];
  /** Denormalized list of service names in selection order, used for display/aria. */
  serviceNames?: string[];
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes: string;
  status?: string;
  category?: string | null;
  categoryId?: number | null;
  categoryLabel?: string | null;
  categoryColor?: string | null;
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
  /** When editing a recurring appointment: 'this' (default) or 'series'. */
  scope?: 'this' | 'series';
}

/**
 * Initial-data shape received from the server when editing/viewing an
 * appointment. Accepts either the new `serviceIds: string[]` array or the
 * legacy single `serviceId: string` (older API responses) — the form
 * normalizes both via `buildInitialState`.
 */
export interface AppointmentInitialData
  extends Partial<Omit<AppointmentFormPayload, 'serviceIds'>> {
  serviceIds?: string[];
  /** Legacy single-service field, kept for back-compat with old payloads. */
  serviceId?: string;
}
