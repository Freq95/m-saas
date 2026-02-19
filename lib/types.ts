/**
 * TypeScript type definitions for the application
 * Replaces 'any' types with proper type definitions
 */

// Database row types
export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: number;
  user_id: number;
  channel: 'email' | 'facebook' | 'form' | 'sms' | 'whatsapp';
  channel_id: string | null;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  subject: string | null;
  client_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  direction: 'inbound' | 'outbound';
  content: string;
  is_read?: boolean;
  sent_at: string | null;
  created_at: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  created_at: string;
}

export interface Service {
  id: number;
  user_id: number;
  name: string;
  duration_minutes: number;
  price: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: number;
  user_id: number;
  conversation_id: number | null;
  service_id: number | null;
  client_id: number | null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'completed' | 'cancelled' | 'no-show';
  notes: string | null;
  google_calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: number;
  user_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  source: 'email' | 'facebook' | 'form' | 'walk-in' | 'referral' | 'unknown';
  status: 'lead' | 'active' | 'inactive' | 'vip' | 'deleted';
  tags: string[];
  notes: string | null;
  total_spent: number;
  total_appointments: number;
  last_appointment_date: string | null;
  last_conversation_date: string | null;
  last_activity_date: string | null;
  first_contact_date: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  user_id: number;
  client_id: number | null;
  contact_id: number | null; // Legacy support
  title: string;
  description: string | null;
  due_date: string | null;
  status: 'open' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: number;
  appointment_id: number;
  channel: 'sms' | 'whatsapp' | 'email';
  message: string | null;
  status: 'pending' | 'sent' | 'failed';
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientNote {
  id: number;
  client_id: number;
  user_id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ClientFile {
  id: number;
  client_id: number;
  filename: string;
  original_filename: string;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  details?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Query result type
export interface QueryResult<T = unknown> {
  rows: T[];
}

