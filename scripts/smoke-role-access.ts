import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const DB_NAME = process.env.MONGODB_DB || 'm-saas';

type CookieJar = Map<string, string>;

function readSetCookies(res: Response): string[] {
  const headersAny = res.headers as any;
  if (typeof headersAny.getSetCookie === 'function') return headersAny.getSetCookie();
  const single = res.headers.get('set-cookie');
  return single ? [single] : [];
}

function updateJarFromResponse(jar: CookieJar, res: Response) {
  for (const cookie of readSetCookies(res)) {
    const first = cookie.split(';')[0];
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    jar.set(first.slice(0, eq).trim(), first.slice(eq + 1).trim());
  }
}

function cookieHeader(jar: CookieJar): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function login(email: string, password: string): Promise<CookieJar> {
  const jar: CookieJar = new Map();
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  updateJarFromResponse(jar, csrfRes);
  const csrfJson = await csrfRes.json() as { csrfToken?: string };
  if (!csrfJson.csrfToken) throw new Error('Missing csrf token');

  const form = new URLSearchParams({
    csrfToken: csrfJson.csrfToken,
    email,
    password,
    callbackUrl: `${BASE_URL}/dashboard`,
    json: 'true',
  });

  const cbRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookieHeader(jar),
    },
    body: form,
    redirect: 'manual',
  });
  updateJarFromResponse(jar, cbRes);
  if (cbRes.status >= 400) throw new Error(`Login failed: ${cbRes.status}`);
  return jar;
}

async function ensureStaffUser() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(DB_NAME);

  const tenant = await db.collection('tenants').findOne({ slug: 'tenant-a-clinic' });
  if (!tenant) throw new Error('tenant-a-clinic not found; run smoke-tenant-isolation first');

  const nowIso = new Date().toISOString();
  const email = 'staff.tenant.a@example.com';
  const password = 'StaffA!Pass123';
  const passwordHash = await bcrypt.hash(password, 12);
  const numericId = 910003;

  let user = await db.collection('users').findOne({ email, tenant_id: tenant._id });
  if (!user) {
    const result = await db.collection('users').insertOne({
      id: numericId,
      email,
      password_hash: passwordHash,
      name: 'Staff A',
      role: 'staff',
      tenant_id: tenant._id,
      status: 'active',
      created_at: nowIso,
      updated_at: nowIso,
    });
    user = { _id: result.insertedId };
  } else {
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          password_hash: passwordHash,
          role: 'staff',
          status: 'active',
          tenant_id: tenant._id,
          updated_at: nowIso,
        },
      }
    );
  }

  await db.collection('team_members').updateOne(
    { tenant_id: tenant._id, user_id: user._id },
    {
      $set: {
        tenant_id: tenant._id,
        user_id: user._id,
        email,
        role: 'staff',
        status: 'active',
        accepted_at: nowIso,
        updated_at: nowIso,
      },
      $setOnInsert: {
        invited_by: user._id,
        invited_at: nowIso,
        created_at: nowIso,
      },
    },
    { upsert: true }
  );

  await client.close();
  return { email, password };
}

async function main() {
  const staff = await ensureStaffUser();
  const jar = await login(staff.email, staff.password);

  const inviteRes = await fetch(`${BASE_URL}/api/team/invite`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader(jar),
    },
    body: JSON.stringify({ email: `new.staff.${Date.now()}@example.com`, name: 'New Staff' }),
  });

  const teamRes = await fetch(`${BASE_URL}/api/team`, {
    method: 'GET',
    headers: { cookie: cookieHeader(jar) },
  });

  const settingsRes = await fetch(`${BASE_URL}/api/settings/email-integrations`, {
    method: 'GET',
    headers: { cookie: cookieHeader(jar) },
  });

  console.log(JSON.stringify({
    inviteStatus: inviteRes.status,
    teamStatus: teamRes.status,
    settingsStatus: settingsRes.status,
    passed: inviteRes.status === 403 && teamRes.status === 403 && settingsRes.status === 403,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
