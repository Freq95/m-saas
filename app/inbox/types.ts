/**
 * Type definitions for inbox components
 */

export interface Conversation {
  id: number;
  channel: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  subject: string;
  status: string;
  message_count: number;
  last_message_at: string;
  tags: string[];
  unread_count?: number;
}

export interface Message {
  id: number;
  direction: 'inbound' | 'outbound';
  content?: string;
  text?: string;
  html?: string;
  sent_at: string;
  images?: Array<{ url?: string; cid?: string; data?: string; contentType: string }>;
  attachments?: Array<{ filename: string; contentType: string; size: number }>;
}

export interface GroupedMessageItem {
  type: 'date' | 'message';
  date?: Date;
  message?: Message;
}

export interface MessagesByConversation {
  [conversationId: number]: Message[];
}

