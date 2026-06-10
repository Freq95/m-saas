import { ObjectId } from 'mongodb';
import { invalidateCache } from '@/lib/redis';
import { withRedisPrefix } from '@/lib/redis-prefix';

const CACHE_PREFIX = 'cache:v1';

type Scope = {
  tenantId: ObjectId;
  userId: number;
};

type CacheInvalidationScope = Scope & {
  calendarId?: number;
  viewerDbUserId?: ObjectId | string | null;
  additionalScopes?: Scope[];
  additionalViewerDbUserIds?: Array<ObjectId | string | null | undefined>;
};

function scopePrefix({ tenantId, userId }: Scope): string {
  return withRedisPrefix(`${CACHE_PREFIX}:t:${tenantId.toString()}:u:${userId}`);
}

function viewerPrefix(dbUserId: ObjectId | string): string {
  return withRedisPrefix(`${CACHE_PREFIX}:viewer:${dbUserId.toString()}`);
}

function serializeQuery(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined);
  entries.sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

function buildScopePatterns(scope: Scope): string[] {
  const base = scopePrefix(scope);
  return [
    `${base}:appointments:*`,
    `${base}:clients:*`,
    `${base}:services:*`,
    `${base}:appointment_categories:*`,
    `${base}:dashboard:*`,
    `${base}:team:*`,
    `${base}:conversations:*`,
  ];
}

export function calendarListCacheKey(dbUserId: ObjectId | string): string {
  return `${viewerPrefix(dbUserId)}:calendars:list`;
}

export function clientsListCacheKey(
  scope: Scope,
  params: {
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
    consentFilter?: string;
  }
): string {
  return `${scopePrefix(scope)}:clients:list:${serializeQuery(params)}`;
}

export function servicesListCacheKey(scope: Scope): string {
  return `${scopePrefix(scope)}:services:list`;
}

export function appointmentCategoriesCacheKey(scope: Scope): string {
  return `${scopePrefix(scope)}:appointment_categories:list`;
}

// Server-local YYYY-MM-DD. The dashboard "today" section is date-sensitive, so
// the cache key must change at the day boundary — otherwise a snapshot computed
// just before midnight is served (until TTL) with yesterday's "today" data.
// Matches the `format(now, 'yyyy-MM-dd')` basis used in getDashboardData.
function localDateKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function dashboardCacheKey(scope: Scope, days: number): string {
  return `${scopePrefix(scope)}:dashboard:days=${days}:date=${localDateKey()}`;
}

export function dashboardVisibleCalendarsCacheKey(scope: Scope, days: number, calendarIds: number[]): string {
  const normalizedIds = Array.from(new Set(calendarIds)).sort((a, b) => a - b).join(',');
  return `${scopePrefix(scope)}:dashboard:days=${days}:calendars=${normalizedIds || 'none'}:date=${localDateKey()}`;
}

export function conversationsCacheKey(scope: Scope): string {
  return `${scopePrefix(scope)}:conversations:list`;
}

// Invalidates the caller's own scoped read caches (and a few directly-related ones).
//
// Prior versions ran 3+ MongoDB queries here to discover all shared-calendar viewers
// and invalidate their caches too. With tag-based revalidation, the calendar-id tag
// already covers shared viewers (they read the same calendar tag), so the cascade was
// pure wasted DB work. Removing it cuts ~500-800ms off every appointment write.
//
// Trade-off: a viewer's *list-level* cache (e.g. their dashboard summary) may show
// stale data for up to TTL seconds after another user writes to a shared calendar.
// That window is short and acceptable; the writer's own caches invalidate immediately.
export async function invalidateReadCaches(scope: CacheInvalidationScope): Promise<number> {
  const patterns = new Set<string>(buildScopePatterns(scope));

  if (scope.viewerDbUserId) {
    patterns.add(calendarListCacheKey(scope.viewerDbUserId));
  }

  for (const dbUserId of scope.additionalViewerDbUserIds || []) {
    if (dbUserId) {
      patterns.add(calendarListCacheKey(dbUserId));
    }
  }

  for (const extraScope of scope.additionalScopes || []) {
    for (const pattern of buildScopePatterns(extraScope)) {
      patterns.add(pattern);
    }
  }

  if (scope.calendarId) {
    patterns.add(withRedisPrefix(`${CACHE_PREFIX}:calendar:${scope.calendarId}:appointments:*`));
  }

  const removed = await Promise.all(Array.from(patterns).map((pattern) => invalidateCache(pattern)));
  return removed.reduce((sum, value) => sum + value, 0);
}
