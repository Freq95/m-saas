/**
 * Standardized error handling utility
 * Provides consistent error responses across all API endpoints
 */

import { NextResponse } from 'next/server';
import { AuthError } from '@/lib/auth-helpers';

export interface ApiError {
  error: string;
  details?: string;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: string,
  status: number = 500,
  details?: string | Error
): NextResponse<ApiError> {
  const errorDetails = 
    details instanceof Error 
      ? (process.env.NODE_ENV === 'development' ? details.message : undefined)
      : (process.env.NODE_ENV === 'development' ? details : undefined);

  return NextResponse.json(
    {
      error,
      ...(errorDetails && { details: errorDetails }),
    },
    { status }
  );
}

/**
 * Handle API errors with standardized responses
 */
export function handleApiError(error: unknown, defaultMessage: string = 'An error occurred'): NextResponse<ApiError> {
  if (error instanceof AuthError) {
    return createErrorResponse(error.message, error.status);
  }

  if (error instanceof Error) {
    // Validation errors
    if (error.name === 'ZodError') {
      return createErrorResponse(
        'Invalid input',
        400,
        error.message
      );
    }

    // Not found errors
    if (error.message.includes('not found') || error.message.includes('Not found')) {
      return createErrorResponse(
        error.message,
        404
      );
    }

    // Bad request errors
    if (error.message.includes('Invalid') || error.message.includes('required')) {
      return createErrorResponse(
        error.message,
        400
      );
    }

    // Default error
    return createErrorResponse(
      defaultMessage,
      500,
      error
    );
  }

  // Unknown error type
  return createErrorResponse(
    defaultMessage,
    500,
    String(error)
  );
}

/**
 * Create success response
 */
export function createSuccessResponse<T>(data: T, status: number = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

