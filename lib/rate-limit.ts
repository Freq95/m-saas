/**
 * Shared rate limiting utilities — in-memory only.
 * Upstash Redis-backed rate limiting is not configured.
 * To enable: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in environment variables,
 * then restore the Ratelimit import and getWriteLimiter() logic below.
 */

// import { Ratelimit } from '@upstash/ratelimit';
// import { getRedis } from './redis';
// import { withRedisPrefix } from './redis-prefix';

import { NextResponse } from 'next/server';

const WRITE_LIMIT = 30;
const WRITE_WINDOW_MS = 60 * 1000;
const writeFallbackStore = new Map<string, { count: number; resetAt: number }>();

const UPDATE_LIMIT = 60;
const UPDATE_WINDOW_MS = 60 * 1000;
const updateFallbackStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check whether the given user has exceeded the update/delete rate limit (60/min).
 * Used on PATCH and DELETE endpoints.
 */
export async function checkUpdateRateLimit(userId: number | string): Promise<NextResponse | null> {
  const identifier = String(userId);
  const now = Date.now();
  const existing = updateFallbackStore.get(identifier);
  if (!existing || now > existing.resetAt) {
    updateFallbackStore.set(identifier, { count: 1, resetAt: now + UPDATE_WINDOW_MS });
    return null;
  }
  if (existing.count >= UPDATE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a moment.' },
      { status: 429 }
    );
  }
  existing.count += 1;
  return null;
}

// GDPR export: 5 exports per hour per user (each export triggers R2 signed URL generation
// and 7+ parallel DB queries — low limit prevents cost abuse)
const GDPR_EXPORT_LIMIT = 5;
const GDPR_EXPORT_WINDOW_MS = 60 * 60 * 1000;
const gdprExportFallbackStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Check whether the given user has exceeded the write rate limit.
 * Returns a 429 NextResponse when limited, or null when the request may proceed.
 */
export async function checkWriteRateLimit(userId: number | string): Promise<NextResponse | null> {
  const identifier = String(userId);
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

/**
 * Check whether the given user has exceeded the GDPR export rate limit (5/hr).
 * Returns a 429 NextResponse when limited, or null when the request may proceed.
 */
export async function checkGdprExportRateLimit(userId: number | string): Promise<NextResponse | null> {
  const identifier = String(userId);
  const now = Date.now();
  const existing = gdprExportFallbackStore.get(identifier);
  if (!existing || now > existing.resetAt) {
    gdprExportFallbackStore.set(identifier, { count: 1, resetAt: now + GDPR_EXPORT_WINDOW_MS });
    return null;
  }
  if (existing.count >= GDPR_EXPORT_LIMIT) {
    return NextResponse.json(
      { error: 'Export rate limit exceeded. Please try again later.' },
      { status: 429 }
    );
  }
  existing.count += 1;
  return null;
}
