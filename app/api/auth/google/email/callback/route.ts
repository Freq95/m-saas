import { google } from 'googleapis';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-helpers';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { saveEmailIntegration } from '@/lib/email-integrations';
import { initGmailOAuthClient } from '@/lib/gmail';

// GET /api/auth/google/email/callback
export async function GET(request: NextRequest) {
  const redirectTo = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.cookies.set('google_oauth_state', '', {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    });
    return response;
  };

  let userId: number;
  let tenantId: import('mongodb').ObjectId | undefined;
  try {
    const user = await getAuthUser();
    userId = user.userId;
    tenantId = user.tenantId;
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const storedState = request.cookies.get('google_oauth_state')?.value;

    if (!state || !storedState || state !== storedState) {
      return redirectTo('/settings/email?error=invalid_state');
    }
    if (!code) {
      return redirectTo('/settings/email?error=no_code');
    }

    const client = initGmailOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email = profile.data.emailAddress;
    if (!email) {
      return redirectTo('/settings/email?error=no_email');
    }

    await saveEmailIntegration(
      userId,
      tenantId,
      'gmail',
      email,
      undefined,
      tokens.refresh_token || undefined,
      tokens.access_token || undefined
    );

    if (tokens.expiry_date) {
      const db = await getMongoDbOrThrow();
      await db.collection('email_integrations').updateOne(
        { user_id: userId, tenant_id: tenantId, provider: 'gmail' },
        { $set: { token_expires_at: tokens.expiry_date, updated_at: new Date().toISOString() } }
      );
    }

    return redirectTo('/settings/email?connected=gmail');
  } catch {
    return redirectTo('/settings/email?error=oauth_failed');
  }
}
