/**
 * Centralized logging utility
 * Replaces console.log/error/warn with proper logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Error;
}

const REDACT_KEY_PATTERNS = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'encrypted_password',
  'apppassword',
  'email',
  'phone',
  'name',
  'content',
  'message',
  'subject',
  'body',
  'text',
  'notes',
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /(?<!\d)\+?\d[\d\s().-]{6,}\d(?!\d)/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._-]+\b/gi;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return REDACT_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function redactString(value: string): string {
  return value
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(PHONE_PATTERN, '[REDACTED_PHONE]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED_TOKEN]');
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Error) {
    return redactString(value.message);
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = redactValue(nested);
    }
  }
  return output;
}

class Logger {
  private isDevelopment: boolean;
  private logLevel: LogLevel;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV === 'development';
    // Set log level from environment or default to 'info'
    this.logLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const safeMessage = redactString(entry.message);
    const contextStr = entry.context ? ` ${JSON.stringify(redactValue(entry.context))}` : '';
    const errorStr = entry.error ? ` Error: ${redactString(entry.error.message)}` : '';
    return `[${timestamp}] [${entry.level.toUpperCase()}] ${safeMessage}${contextStr}${errorStr}`;
  }

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      error,
    };

    const formattedMessage = this.formatMessage(entry);

    // In production, only log errors and warnings
    // In development, log everything
    if (this.isDevelopment || level === 'error' || level === 'warn') {
      switch (level) {
        case 'debug':
        case 'info':
          console.log(formattedMessage);
          break;
        case 'warn':
          console.warn(formattedMessage);
          break;
        case 'error':
          console.error(formattedMessage);
          if (error && this.isDevelopment) {
            console.error(error.stack);
          }
          break;
      }
    }

    // In production, you could send errors to an external logging service
    // Example: Sentry, LogRocket, etc.
    if (level === 'error' && !this.isDevelopment) {
      // TODO: Send to external logging service
      // Example: Sentry.captureException(error);
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context);
  }

  error(
    message: string,
    errorOrContext?: Error | Record<string, unknown>,
    context?: Record<string, unknown>
  ) {
    if (errorOrContext instanceof Error) {
      this.log('error', message, context, errorOrContext);
      return;
    }
    this.log('error', message, errorOrContext, undefined);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export Logger class for testing
export { Logger };

