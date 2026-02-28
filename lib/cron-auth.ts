import { NextRequest } from 'next/server';
import crypto from 'crypto';

export function hasValidCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice(7);
  const tokenBuf = Buffer.from(token, 'utf8');
  const secretBuf = Buffer.from(secret, 'utf8');
  if (tokenBuf.length !== secretBuf.length) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(tokenBuf, secretBuf);
  } catch {
    return false;
  }
}
