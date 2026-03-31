// Upstash Redis is not configured. Cache calls fall through to the source fetcher.
// To enable: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in environment variables.
// import { Redis } from '@upstash/redis';

export function getRedis(): null {
  return null;
}

export async function getCached<T>(
  _key: string,
  _ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  return fetcher();
}

export async function invalidateCache(_pattern: string): Promise<number> {
  return 0;
}
