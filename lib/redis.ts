import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }
  if (!redisClient) {
    redisClient = new Redis({ url, token });
  }
  return redisClient;
}

export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const redis = getRedis();
  if (!redis) {
    return fetcher();
  }

  try {
    const cached = await redis.get<T>(key);
    if (cached !== null) {
      return cached;
    }
  } catch {
    // Ignore cache read failures and fall back to source fetch.
  }

  const data = await fetcher();
  try {
    // Upstash Redis auto-serializes JSON values; do not JSON.stringify manually.
    await redis.set(key, data, { ex: ttlSeconds });
  } catch {
    // Ignore cache write failures.
  }
  return data;
}

export async function invalidateCache(pattern: string): Promise<number> {
  const redis = getRedis();
  if (!redis) {
    return 0;
  }

  try {
    let deleted = 0;
    let cursor = '0';
    do {
      const scanResult = await (redis as any).scan(cursor, {
        match: pattern,
        count: 100,
      });
      const nextCursor = String(scanResult?.[0] ?? '0');
      const keys = Array.isArray(scanResult?.[1]) ? (scanResult[1] as string[]) : [];
      cursor = nextCursor;
      if (keys.length > 0) {
        const removed = await redis.del(...keys);
        deleted += Number(removed || 0);
      }
    } while (cursor !== '0');

    return deleted;
  } catch {
    return 0;
  }
}
