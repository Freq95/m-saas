import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { MongoClient, ObjectId } from 'mongodb';

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const DB_NAME = process.env.MONGODB_DB || 'm-saas';

type CookieJar = Map<string, string>;

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

function cookieHeader(jar: CookieJar): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function login(email: string, password: string): Promise<CookieJar> {
  const jar: CookieJar = new Map();

  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`, { method: 'GET' });
  updateJarFromResponse(jar, csrfRes);
  if (!csrfRes.ok) throw new Error(`CSRF failed for ${email}: ${csrfRes.status}`);
  const csrfJson = await csrfRes.json() as { csrfToken?: string };
  if (!csrfJson.csrfToken) throw new Error(`Missing csrfToken for ${email}`);

  const body = new URLSearchParams({
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
    body,
    redirect: 'manual',
  });
  updateJarFromResponse(jar, cbRes);
  if (cbRes.status >= 400) throw new Error(`Login failed for ${email}: ${cbRes.status}`);

  return jar;
}

async function ensureOwner(
  db: any,
  tenantName: string,
  tenantSlug: string,
  email: string,
  name: string,
  password: string,
  numericUserId: number
) {
  const nowIso = new Date().toISOString();
  let tenant = await db.collection('tenants').findOne({ slug: tenantSlug });
  if (!tenant) {
    const result = await db.collection('tenants').insertOne({
      name: tenantName,
      slug: tenantSlug,
      owner_id: null,
      plan: 'free',
      status: 'active',
      max_seats: 5,
      settings: { timezone: 'Europe/Bucharest', currency: 'RON' },
      created_at: nowIso,
      updated_at: nowIso,
    });
    tenant = { _id: result.insertedId };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  let user = await db.collection('users').findOne({ email, tenant_id: tenant._id });
  if (!user) {
    const result = await db.collection('users').insertOne({
      id: numericUserId,
      email,
      password_hash: passwordHash,
      name,
      role: 'owner',
      tenant_id: tenant._id,
      status: 'active',
      created_at: nowIso,
      updated_at: nowIso,
    });
    user = { _id: result.insertedId, id: numericUserId };
  } else {
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          password_hash: passwordHash,
          role: 'owner',
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
        role: 'owner',
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

  await db.collection('tenants').updateOne(
    { _id: tenant._id },
    { $set: { owner_id: user._id, updated_at: nowIso } }
  );
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(DB_NAME);

  const ownerAPassword = 'TenantA!Pass123';
  const ownerBPassword = 'TenantB!Pass123';
  const ownerAEmail = 'owner.tenant.a@example.com';
  const ownerBEmail = 'owner.tenant.b@example.com';

  await ensureOwner(db, 'Tenant A Clinic', 'tenant-a-clinic', ownerAEmail, 'Owner A', ownerAPassword, 910001);
  await ensureOwner(db, 'Tenant B Clinic', 'tenant-b-clinic', ownerBEmail, 'Owner B', ownerBPassword, 910002);
  await client.close();

  const ownerAJar = await login(ownerAEmail, ownerAPassword);
  const createRes = await fetch(`${BASE_URL}/api/clients`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader(ownerAJar),
    },
    body: JSON.stringify({
      name: `Isolation Test ${Date.now()}`,
      email: `isolation.${Date.now()}@example.com`,
      phone: '0712345678',
    }),
  });
  const createJson = await createRes.json() as any;
  if (!createRes.ok || !createJson?.client?.id) {
    throw new Error(`Owner A failed to create client: ${createRes.status} ${JSON.stringify(createJson)}`);
  }
  const createdClientId = createJson.client.id;

  const ownerBJar = await login(ownerBEmail, ownerBPassword);
  const listRes = await fetch(`${BASE_URL}/api/clients`, {
    method: 'GET',
    headers: { cookie: cookieHeader(ownerBJar) },
  });
  const listJson = await listRes.json() as any;
  if (!listRes.ok) {
    throw new Error(`Owner B list clients failed: ${listRes.status} ${JSON.stringify(listJson)}`);
  }

  const clients: any[] = Array.isArray(listJson?.clients) ? listJson.clients : [];
  const leakedInList = clients.some((c) => c?.id === createdClientId);

  const getRes = await fetch(`${BASE_URL}/api/clients/${createdClientId}`, {
    method: 'GET',
    headers: { cookie: cookieHeader(ownerBJar) },
  });

  console.log(JSON.stringify({
    ownerAClientId: createdClientId,
    ownerBListStatus: listRes.status,
    ownerBDirectGetStatus: getRes.status,
    leakedInList,
    passed: !leakedInList && getRes.status === 404,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
