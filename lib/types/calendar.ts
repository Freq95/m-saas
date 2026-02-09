// Calendar-related type definitions

export interface Provider {
  id: number;
  user_id: number;
  name: string;
  email: string;
  role: 'dentist' | 'hygienist' | 'assistant';
  color: string; // Hex color for calendar display
  working_hours: {
    [day: string]: {
      start: string; // "09:00"
      end: string; // "17:00"
      breaks: Array<{ start: string; end: string }>;
    };
  };
  is_active: boolean;
  created_at: Date;
}

export interface Resource {
  id: number;
  user_id: number;
  name: string;
  type: 'chair' | 'room' | 'equipment';
  is_active: boolean;
  created_at: Date;
}

export interface BlockedTime {
  id: number;
  user_id: number;
  provider_id?: number; // null = all providers
  resource_id?: number; // null = all resources
  start_time: Date;
  end_time: Date;
  reason: string;
  recurrence?: RecurrenceRule;
  recurrence_group_id?: number;
  created_at: Date;
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number; // Every N days/weeks/months
  days_of_week?: number[]; // For weekly: [1,3,5] = Mon,Wed,Fri
  end_date?: string; // ISO date string
  count?: number; // End after N occurrences
}

export interface RecurringAppointment {
  id: number;
  recurrence_group_id: number;
  recurrence: RecurrenceRule;
  // ... rest of appointment fields
}

export interface WaitlistEntry {
  id: number;
  user_id: number;
  client_id: number;
  service_id: number;
  provider_id?: number;
  preferred_days: number[]; // [1,2,3] = Mon,Tue,Wed
  preferred_times: string[]; // ["morning", "afternoon", "evening"]
  notes: string;
  created_at: Date;
  notified_at?: Date;
}

export interface ConflictCheck {
  hasConflict: boolean;
  conflicts: any[];
  suggestions: Array<{ start: Date; end: Date }>; // Alternative slots
}
