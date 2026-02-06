import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple in-memory rate limiting store
// In production, use Redis or similar
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = 100; // per window
const RATE_LIMIT_STRICT_MAX_REQUESTS = 20; // for write operations

function getClientIdentifier(request: NextRequest): string {
  // In production, use proper authentication token or session ID
  // For now, use IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
  return ip;
}

function isWriteOperation(pathname: string): boolean {
  // Check if this is a write operation (POST, PUT, PATCH, DELETE)
  const writePaths = [
    '/api/appointments',
    '/api/conversations',
    '/api/clients',
    '/api/services',
    '/api/tasks',
    '/api/reminders',
    '/api/webhooks',
    '/api/yahoo/sync',
  ];
  
  return writePaths.some(path => pathname.startsWith(path));
}

function checkRateLimit(identifier: string, isWrite: boolean): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const maxRequests = isWrite ? RATE_LIMIT_STRICT_MAX_REQUESTS : RATE_LIMIT_MAX_REQUESTS;
  
  const entry = rateLimitStore.get(identifier);
  
  if (!entry || now > entry.resetTime) {
    // Create new entry
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    };
    rateLimitStore.set(identifier, newEntry);
    
    // Cleanup old entries periodically
    if (rateLimitStore.size > 10000) {
      for (const [key, value] of rateLimitStore.entries()) {
        if (now > value.resetTime) {
          rateLimitStore.delete(key);
        }
      }
    }
    
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: newEntry.resetTime,
    };
  }
  
  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
    };
  }
  
  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetTime: entry.resetTime,
  };
}

export function middleware(request: NextRequest) {
  // Disable rate limiting in non-production environments to avoid blocking dev workflows
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.next();
  }

  // Skip rate limiting for static files and Next.js internals
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/api/health') ||
    request.nextUrl.pathname.startsWith('/favicon.ico')
  ) {
    return NextResponse.next();
  }
  
  // Only apply rate limiting to API routes
  if (request.nextUrl.pathname.startsWith('/api')) {
    const identifier = getClientIdentifier(request);
    const isWrite = isWriteOperation(request.nextUrl.pathname);
    const rateLimit = checkRateLimit(identifier, isWrite);
    
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many requests',
          message: `Rate limit exceeded. Please try again after ${new Date(rateLimit.resetTime).toISOString()}`,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': isWrite ? RATE_LIMIT_STRICT_MAX_REQUESTS.toString() : RATE_LIMIT_MAX_REQUESTS.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimit.resetTime.toString(),
            'Retry-After': Math.ceil((rateLimit.resetTime - Date.now()) / 1000).toString(),
          },
        }
      );
    }
    
    // Add rate limit headers to successful requests
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', (isWrite ? RATE_LIMIT_STRICT_MAX_REQUESTS : RATE_LIMIT_MAX_REQUESTS).toString());
    response.headers.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateLimit.resetTime.toString());
    
    return response;
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};

