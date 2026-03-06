/**
 * Shared rate limiting utilities
 * Uses Upstash Redis when available, falls back to in-memory Map.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { NextResponse } from 'next/server';
import { getRedis } from './redis';
import { withRedisPrefix } from './redis-prefix';

// ---------------------------------------------------------------------------
// Write rate limit — 30 mutations per minute per authenticated user.
// Applied to all POST / PATCH / DELETE routes that mutate tenant data.
// ---------------------------------------------------------------------------

const WRITE_LIMIT = 30;
const WRITE_WINDOW_MS = 60 * 1000;
const writeFallbackStore = new Map<string, { count: number; resetAt: number }>();
let writeLimiter: Ratelimit | null = null;

function getWriteLimiter(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  if (!writeLimiter) {
    writeLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(WRITE_LIMIT, '1 m'),
      prefix: withRedisPrefix('rl:write'),
      analytics: false,
    });
  }
  return writeLimiter;
}

/**
 * Check whether the given user has exceeded the write rate limit.
 * Returns a 429 NextResponse when limited, or null when the request may proceed.
 */
export async function checkWriteRateLimit(userId: number | string): Promise<NextResponse | null> {
  const identifier = String(userId);
  const limiter = getWriteLimiter();

  if (limiter) {
    const result = await limiter.limit(identifier);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again in a moment.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((result.reset - Date.now()) / 1000)),
          },
        }
      );
    }
    return null;
  }

  // In-memory fallback (single-instance; sufficient for development / low-traffic)
  const now = Date.now();
  const existing = writeFallbackStore.get(identifier);
  if (!existing || now > existing.resetAt) {
    writeFallbackStore.set(identifier, { count: 1, resetAt: now + WRITE_WINDOW_MS });
    return null;
  }
  if (existing.count >= WRITE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a moment.' },
      { status: 429 }
    );
  }
  existing.count += 1;
  return null;
}
