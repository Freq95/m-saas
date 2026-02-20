import { AuthSession, CookieJar } from './types';
import { withBenchmarkBypassHeaders } from './benchmark-headers';

function readSetCookies(res: Response): string[] {
  const headersAny = res.headers as any;
  if (typeof headersAny.getSetCookie === 'function') {
    return headersAny.getSetCookie();
  }
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}

function updateJarFromResponse(jar: CookieJar, res: Response) {
  const setCookies = readSetCookies(res);
  for (const cookie of setCookies) {
    const first = cookie.split(';')[0];
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    jar.set(name, value);
  }
}

function cookieHeaderFromJar(jar: CookieJar): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

export async function loginWithCredentials(baseUrl: string, email: string, password: string): Promise<AuthSession> {
  const jar: CookieJar = new Map();

  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, {
    method: 'GET',
    headers: withBenchmarkBypassHeaders(),
  });
  updateJarFromResponse(jar, csrfRes);
  if (!csrfRes.ok) {
    throw new Error(`CSRF request failed for ${email}: ${csrfRes.status}`);
  }
  const csrfJson = await csrfRes.json() as { csrfToken?: string };
  if (!csrfJson.csrfToken) {
    throw new Error(`Missing csrfToken for ${email}`);
  }

  const formBody = new URLSearchParams({
    csrfToken: csrfJson.csrfToken,
    email,
    password,
    callbackUrl: `${baseUrl}/dashboard`,
    json: 'true',
  });

  const callbackRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookieHeaderFromJar(jar),
      ...withBenchmarkBypassHeaders(),
    },
    body: formBody,
    redirect: 'manual',
  });

  updateJarFromResponse(jar, callbackRes);
  if (callbackRes.status >= 400) {
    throw new Error(`Login failed for ${email}: ${callbackRes.status}`);
  }

  return {
    jar,
    cookieHeader: cookieHeaderFromJar(jar),
  };
}
