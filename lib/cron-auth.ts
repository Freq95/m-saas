import { NextRequest } from 'next/server';

export function hasValidCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

