const DEFAULT_PREFIX = 'm-saas';

function normalizePrefix(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9:_-]/g, '-');
}

export function getRedisKeyPrefix(): string {
  const raw = process.env.REDIS_KEY_PREFIX || DEFAULT_PREFIX;
  const normalized = normalizePrefix(raw);
  return normalized || DEFAULT_PREFIX;
}

export function withRedisPrefix(key: string): string {
  return `${getRedisKeyPrefix()}:${key}`;
}

