export interface StorageData {
  users: any[];
  conversations: any[];
  messages: any[];
  tags: any[];
  conversation_tags: any[];
  services: any[];
  appointments: any[];
  reminders: any[];
  google_calendar_sync: any[];
  clients: any[];
  tasks: any[];
  client_files: any[];
  client_notes: any[];
  email_integrations: any[];
  // Legacy support (kept for migration compatibility)
  contact_files?: any[];
  contact_custom_fields?: any[];
  contact_notes?: any[];
}
