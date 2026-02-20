import { ObjectId } from 'mongodb';
import { invalidateCache } from '@/lib/redis';
import { withRedisPrefix } from '@/lib/redis-prefix';

const CACHE_PREFIX = 'cache:v1';

type Scope = {
  tenantId: ObjectId;
  userId: number;
};

function scopePrefix({ tenantId, userId }: Scope): string {
  return withRedisPrefix(`${CACHE_PREFIX}:t:${tenantId.toString()}:u:${userId}`);
}

function serializeQuery(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, value]) => value !== undefined);
  entries.sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
}

export function appointmentsListCacheKey(
  scope: Scope,
  params: {
    startDate?: string;
    endDate?: string;
    providerId?: number;
    resourceId?: number;
    status?: string;
  }
): string {
  return `${scopePrefix(scope)}:appointments:list:${serializeQuery(params)}`;
}

export function clientsListCacheKey(
  scope: Scope,
  params: {
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    limit?: number;
  }
): string {
  return `${scopePrefix(scope)}:clients:list:${serializeQuery(params)}`;
}

export function servicesListCacheKey(scope: Scope): string {
  return `${scopePrefix(scope)}:services:list`;
}

export function providersListCacheKey(scope: Scope): string {
  return `${scopePrefix(scope)}:providers:list`;
}

export function resourcesListCacheKey(scope: Scope): string {
  return `${scopePrefix(scope)}:resources:list`;
}

export function dashboardCacheKey(scope: Scope, days: number): string {
  return `${scopePrefix(scope)}:dashboard:days=${days}`;
}

export async function invalidateReadCaches(scope: Scope): Promise<number> {
  const base = scopePrefix(scope);
  const patterns = [
    `${base}:appointments:*`,
    `${base}:clients:*`,
    `${base}:services:*`,
    `${base}:providers:*`,
    `${base}:resources:*`,
    `${base}:dashboard:*`,
  ];

  const removed = await Promise.all(patterns.map((pattern) => invalidateCache(pattern)));
  return removed.reduce((sum, value) => sum + value, 0);
}
