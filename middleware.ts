import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 100;
const RATE_LIMIT_STRICT_MAX_REQUESTS = 20;

function isWriteOperation(pathname: string): boolean {
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
  return writePaths.some((path) => pathname.startsWith(path));
}

function getClientIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown';
  return ip;
}

function checkRateLimit(
  identifier: string,
  isWrite: boolean
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const maxRequests = isWrite ? RATE_LIMIT_STRICT_MAX_REQUESTS : RATE_LIMIT_MAX_REQUESTS;
  const entry = rateLimitStore.get(identifier);

  if (!entry || now > entry.resetTime) {
    const resetTime = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(identifier, { count: 1, resetTime });
    return { allowed: true, remaining: maxRequests - 1, resetTime };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }

  entry.count += 1;
  return { allowed: true, remaining: maxRequests - entry.count, resetTime: entry.resetTime };
}

const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/invite/',
  '/api/auth',
  '/api/invite/',
  '/api/webhooks',
  '/api/health',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next();
  }

  const isPublic = PUBLIC_PATH_PREFIXES.some((path) => pathname.startsWith(path));
  if (!isPublic) {
    const token = await getToken({ req: request, secret: process.env.AUTH_SECRET });

    if (!token) {
      if (pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
      if (token.role !== 'super_admin') {
        if (pathname.startsWith('/api')) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    } else if (!token.tenantId) {
      if (pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'No tenant context' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  if (process.env.NODE_ENV === 'production' && pathname.startsWith('/api')) {
    const identifier = getClientIdentifier(request);
    const isWrite = isWriteOperation(pathname);
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
            'X-RateLimit-Limit': isWrite ? String(RATE_LIMIT_STRICT_MAX_REQUESTS) : String(RATE_LIMIT_MAX_REQUESTS),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimit.resetTime),
            'Retry-After': String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)),
          },
        }
      );
    }

    const response = NextResponse.next();
    response.headers.set(
      'X-RateLimit-Limit',
      isWrite ? String(RATE_LIMIT_STRICT_MAX_REQUESTS) : String(RATE_LIMIT_MAX_REQUESTS)
    );
    response.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
    response.headers.set('X-RateLimit-Reset', String(rateLimit.resetTime));
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
