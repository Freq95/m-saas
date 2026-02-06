/**
 * Application constants
 * Centralized constants to avoid magic numbers and hardcoded values
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
export const MAX_PAGE_SIZE = 100;

// Dashboard defaults
export const DEFAULT_DASHBOARD_DAYS = 7;

// Calendar defaults
export const DEFAULT_SERVICE_DURATION_MINUTES = 60;
export const DEFAULT_SLOT_SUGGESTION_DAYS = 7;

// Client segmentation thresholds
export const VIP_THRESHOLD = 1000; // RON
export const INACTIVE_DAYS = 90;
export const NEW_CLIENT_DAYS = 30;
export const FREQUENT_CLIENT_APPOINTMENTS_PER_MONTH = 2;

// Rate limiting (requests per window)
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS = 100; // per window
export const RATE_LIMIT_STRICT_MAX_REQUESTS = 20; // for write operations

// Date/time constants
export const DATE_FORMAT = 'yyyy-MM-dd';
export const DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'";
export const TIMEZONE = 'Europe/Bucharest'; // Romania timezone

// API response limits
export const MAX_EXPORT_RECORDS = 10000;

// Validation limits
export const MAX_STRING_LENGTH = 5000;
export const MAX_EMAIL_LENGTH = 255;
export const MAX_PHONE_LENGTH = 20;
export const MAX_NAME_LENGTH = 255;

// Storage constants
export const STORAGE_DATA_FILE = 'data/data.json';
export const UPLOAD_DIR = 'uploads';

