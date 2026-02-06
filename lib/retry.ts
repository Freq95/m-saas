/**
 * Retry utility for API calls with exponential backoff
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableStatuses?: number[];
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504], // Timeout, rate limit, server errors
  retryableErrors: ['NetworkError', 'TimeoutError', 'AbortError'],
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown, options: Required<RetryOptions>): boolean {
  if (error instanceof Error) {
    // Check if error name is in retryable errors
    if (options.retryableErrors.includes(error.name)) {
      return true;
    }
    
    // Check for network errors
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return true;
    }
  }
  
  return false;
}

function isRetryableStatus(status: number, options: Required<RetryOptions>): boolean {
  return options.retryableStatuses.includes(status);
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  let delayMs = opts.initialDelay;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Check if error is retryable
      let shouldRetry = false;
      
      if (error instanceof Response) {
        shouldRetry = isRetryableStatus(error.status, opts);
      } else {
        shouldRetry = isRetryableError(error, opts);
      }

      if (!shouldRetry) {
        throw error;
      }

      // Wait before retrying with exponential backoff
      await delay(Math.min(delayMs, opts.maxDelay));
      delayMs *= opts.backoffMultiplier;
    }
  }

  throw lastError;
}

/**
 * Wrapper for fetch with retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  return retry(
    async () => {
      const response = await fetch(url, options);
      
      // If response is not ok and status is retryable, throw response to trigger retry
      if (!response.ok && isRetryableStatus(response.status, { ...DEFAULT_OPTIONS, ...retryOptions })) {
        throw response;
      }
      
      return response;
    },
    retryOptions
  );
}

