// Cache layer backed by Next.js `unstable_cache` (uses Vercel Data Cache in production,
// in-memory in dev). Keys keep the legacy `redis-prefix` scheme so callers don't change.
// Invalidation is tag-based via `revalidateTag`; tags are derived from the key/pattern.
import { unstable_cache, revalidateTag } from 'next/cache';

export function getRedis(): null {
  return null;
}

// Extract a stable tag from a cache key or invalidation pattern.
// Recognised shapes (anywhere in the string):
//   t:{tenantId}:u:{userId}:{resource}      → `t-{tenantId}-u-{userId}-{resource}`
//   viewer:{dbUserId}:{resource}            → `viewer-{dbUserId}-{resource}`
//   calendar:{calendarId}:{resource}        → `calendar-{calendarId}-{resource}`
function extractTags(keyOrPattern: string): string[] {
  const stripped = keyOrPattern.replace(/:\*$/, '');
  const tenantMatch = stripped.match(/:t:([^:]+):u:([^:]+):([a-z_]+)/);
  if (tenantMatch) return [`t-${tenantMatch[1]}-u-${tenantMatch[2]}-${tenantMatch[3]}`];
  const viewerMatch = stripped.match(/:viewer:([^:]+):([a-z_]+)/);
  if (viewerMatch) return [`viewer-${viewerMatch[1]}-${viewerMatch[2]}`];
  const calendarMatch = stripped.match(/:calendar:([^:]+):([a-z_]+)/);
  if (calendarMatch) return [`calendar-${calendarMatch[1]}-${calendarMatch[2]}`];
  return [];
}

export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const tags = extractTags(key);
  if (tags.length === 0) {
    // Unrecognised key shape — skip cache to avoid stale-without-invalidation hazard.
    return fetcher();
  }
  const cached = unstable_cache(fetcher, [key], { revalidate: ttlSeconds, tags });
  return cached();
}

export async function invalidateCache(pattern: string): Promise<number> {
  const tags = extractTags(pattern);
  for (const tag of tags) {
    revalidateTag(tag, 'default');
  }
  return tags.length;
}
