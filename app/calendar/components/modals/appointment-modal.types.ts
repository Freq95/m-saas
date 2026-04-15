export interface AppointmentService {
  id: number;
  name: string;
  duration_minutes: number;
  price: number;
}

export interface DentistOption {
  userId: number;
  dbUserId: string;
  displayName: string;
  dentistColor: string;
  providerId: number | null;
  isOwner: boolean;
  isCurrentUser: boolean;
}

export type AppointmentFormPayload = {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  forceNewClient?: boolean;
  calendarId?: number;
  calendarName?: string;
  dentistUserId?: number;
  dentistDisplayName?: string;
  serviceName?: string;
  serviceId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes: string;
  category?: string;
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
};

export type RecurrenceForm = {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  endType: 'date' | 'count';
  endDate: string;
  count: number;
};
