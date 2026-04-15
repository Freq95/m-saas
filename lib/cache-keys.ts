import { ObjectId } from 'mongodb';
import { invalidateCache } from '@/lib/redis';
import { withRedisPrefix } from '@/lib/redis-prefix';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

const CACHE_PREFIX = 'cache:v1';

type Scope = {
  tenantId: ObjectId;
  userId: number;
};

type CacheInvalidationScope = Scope & {
  calendarId?: number;
  viewerDbUserId?: ObjectId | string | null;
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
    `${base}:dashboard:*`,
  ];
}

export function appointmentsListCacheKey(
  scope: Scope,
  params: {
    calendarIds?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    search?: string;
  }
): string {
  return `${scopePrefix(scope)}:appointments:list:${serializeQuery(params)}`;
}

export function calendarListCacheKey(dbUserId: ObjectId | string): string {
  return `${viewerPrefix(dbUserId)}:calendars:list`;
}

export function calendarAppointmentsCacheKey(
  calendarId: number,
  params: {
    startDate?: string;
    endDate?: string;
    status?: string;
    search?: string;
  }
): string {
  return withRedisPrefix(`${CACHE_PREFIX}:calendar:${calendarId}:appointments:${serializeQuery(params)}`);
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

export function dashboardCacheKey(scope: Scope, days: number): string {
  return `${scopePrefix(scope)}:dashboard:days=${days}`;
}

export function conversationsCacheKey(scope: Scope): string {
  return `${scopePrefix(scope)}:conversations:list`;
}

export async function invalidateReadCaches(scope: CacheInvalidationScope): Promise<number> {
  const patterns = new Set<string>(buildScopePatterns(scope));

  if (scope.viewerDbUserId) {
    patterns.add(calendarListCacheKey(scope.viewerDbUserId));
  }

  if (scope.calendarId) {
    patterns.add(withRedisPrefix(`${CACHE_PREFIX}:calendar:${scope.calendarId}:appointments:*`));

    const db = await getMongoDbOrThrow();
    const shares = await db.collection('calendar_shares').find(
      {
        calendar_id: scope.calendarId,
        status: 'accepted',
      },
      {
        projection: {
          shared_with_user_id: 1,
          shared_with_numeric_user_id: 1,
          shared_with_tenant_id: 1,
        },
      }
    ).toArray();

    for (const share of shares) {
      if (share.shared_with_user_id instanceof ObjectId) {
        patterns.add(calendarListCacheKey(share.shared_with_user_id));
      }
      if (share.shared_with_tenant_id instanceof ObjectId && typeof share.shared_with_numeric_user_id === 'number') {
        for (const pattern of buildScopePatterns({
          tenantId: share.shared_with_tenant_id,
          userId: share.shared_with_numeric_user_id,
        })) {
          patterns.add(pattern);
        }
      }
    }
  }

  const removed = await Promise.all(Array.from(patterns).map((pattern) => invalidateCache(pattern)));
  return removed.reduce((sum, value) => sum + value, 0);
}
