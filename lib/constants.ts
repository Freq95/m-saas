/**
 * Application constants
 * Keep this file limited to actively used constants.
 */

// Default user ID (should be replaced with proper authentication)
export const DEFAULT_USER_ID = parseInt(process.env.DEFAULT_USER_ID || '1', 10);

// File upload limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = [
  'image/',
  'application/pdf',
  'text/',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
];

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;

