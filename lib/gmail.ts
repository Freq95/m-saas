import { google, gmail_v1 } from 'googleapis';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { encrypt } from '@/lib/encryption';

export interface ParsedGmailMessage {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  text?: string;
  html?: string;
}

export function initGmailOAuthClient() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth not configured');
  }

  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/api/auth/google/email/callback'
  );
}

export function getGmailAuthUrl(): string {
  const client = initGmailOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
    prompt: 'consent',
  });
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf-8');
}

function extractBody(part: gmail_v1.Schema$MessagePart): { text?: string; html?: string } {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return { text: decodeBase64Url(part.body.data) };
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return { html: decodeBase64Url(part.body.data) };
  }

  if (!part.parts || part.parts.length === 0) {
    return {};
  }

  const result: { text?: string; html?: string } = {};
  for (const subPart of part.parts) {
    const decoded = extractBody(subPart);
    if (decoded.text && !result.text) result.text = decoded.text;
    if (decoded.html && !result.html) result.html = decoded.html;
  }
  return result;
}

export function parseGmailMessage(msg: gmail_v1.Schema$Message): ParsedGmailMessage {
  const headers = msg.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

  const body = msg.payload ? extractBody(msg.payload) : {};

  return {
    messageId: msg.id || '',
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    text: body.text,
    html: body.html,
  };
}

export async function getValidAccessToken(
  integrationId: number,
  accessToken: string | null,
  refreshToken: string | null,
  tokenExpiresAt: number | null
): Promise<string> {
  const fiveMinutesMs = 5 * 60 * 1000;
  const isExpiring = !tokenExpiresAt || Date.now() + fiveMinutesMs >= tokenExpiresAt;

  if (!isExpiring) {
    if (!accessToken) {
      throw new Error('Missing access token');
    }
    return accessToken;
  }

  if (!refreshToken) {
    throw new Error('Missing refresh token');
  }

  const client = initGmailOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }

  const db = await getMongoDbOrThrow();
  await db.collection('email_integrations').updateOne(
    { id: integrationId },
    {
      $set: {
        encrypted_access_token: encrypt(credentials.access_token),
        token_expires_at: credentials.expiry_date ?? null,
        updated_at: new Date().toISOString(),
      },
    }
  );

  return credentials.access_token;
}

export async function fetchGmailMessages(
  accessToken: string,
  lastSyncAt: string | null
): Promise<ParsedGmailMessage[]> {
  const client = initGmailOAuthClient();
  client.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth: client });

  const query = lastSyncAt
    ? `after:${new Date(lastSyncAt).toISOString().slice(0, 10).replace(/-/g, '/')}`
    : 'newer_than:7d';

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 50,
  });

  const messages = listRes.data.messages ?? [];
  const parsed: ParsedGmailMessage[] = [];

  for (const message of messages) {
    if (!message.id) continue;
    const fullMsg = await gmail.users.messages.get({
      userId: 'me',
      id: message.id,
      format: 'full',
    });
    const normalized = parseGmailMessage(fullMsg.data);
    if (normalized.messageId) {
      parsed.push(normalized);
    }
  }

  return parsed;
}

export async function testGmailConnection(
  accessToken: string
): Promise<{ ok: boolean; error?: string; email?: string }> {
  try {
    const client = initGmailOAuthClient();
    client.setCredentials({ access_token: accessToken });
    const gmail = google.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    return { ok: true, email: profile.data.emailAddress || undefined };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
