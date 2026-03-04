import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getGmailAuthUrl } from '@/lib/gmail';

// GET /api/auth/google/email
export async function GET(request: NextRequest) {
  try {
    await getAuthUser();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const state = crypto.randomUUID();
  const authUrl = new URL(getGmailAuthUrl());
  authUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('google_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
