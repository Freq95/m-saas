import type { Session } from 'next-auth';

export function parseSessionUserId(session: Session | null | undefined): number | null {
  const rawId = session?.user?.id;
  if (!rawId || !/^[1-9]\d*$/.test(rawId)) return null;
  const parsed = Number.parseInt(rawId, 10);
  return Number.isFinite(parsed) && String(parsed) === rawId ? parsed : null;
}

export function parseSessionDbUserId(session: Session | null | undefined): string | null {
  const rawId = session?.user?.dbUserId;
  return typeof rawId === 'string' && rawId.trim() ? rawId : null;
}
