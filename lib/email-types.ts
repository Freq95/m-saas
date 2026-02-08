/**
 * Standardized email message types
 * Used across the application for consistent email handling
 */

export interface EmailAttachment {
  id?: number;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  persisted?: boolean;
}

export interface EmailImage {
  cid?: string;
  filename?: string;
  contentType: string;
  url?: string;
  data?: string; // base64 encoded
}

/**
 * Standardized email message structure
 * This is what gets stored in the database
 */
export interface StoredEmailMessage {
  text: string; // Plain text version (cleaned)
  html?: string; // HTML version (if available)
  images?: EmailImage[];
  attachments?: EmailAttachment[];
  messageId?: string;
  uid?: number;
}

/**
 * Parse stored message content
 * Handles both old format (plain text) and new format (JSON)
 */
export function parseStoredMessage(content: string): StoredEmailMessage {
  // Try to parse as JSON (new format)
  try {
    const parsed = JSON.parse(content);
    if (parsed.text !== undefined || parsed.html !== undefined) {
      return {
        text: parsed.text || '',
        html: parsed.html,
        images: parsed.images,
        attachments: parsed.attachments,
      };
    }
  } catch (e) {
    // Not JSON, treat as plain text (old format)
  }

  // Old format: plain text
  return {
    text: content,
  };
}

/**
 * Serialize message for storage
 */
export function serializeMessage(message: StoredEmailMessage): string {
  // Always store as JSON for consistency
  return JSON.stringify(message);
}

