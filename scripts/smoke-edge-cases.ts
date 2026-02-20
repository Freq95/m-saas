import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

const BASE_URL = (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace('localhost', '127.0.0.1');
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

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(DB_NAME);

  const ownerAEmail = 'owner.tenant.a@example.com';
  const ownerAPass = 'TenantA!Pass123';
  const ownerBEmail = 'owner.tenant.b@example.com';
  const ownerBPass = 'TenantB!Pass123';
  const staffAEmail = 'staff.tenant.a@example.com';
  const staffAPass = 'StaffA!Pass123';

  const tenantA = await db.collection('tenants').findOne({ slug: 'tenant-a-clinic' });
  const ownerAUser = tenantA
    ? await db.collection('users').findOne({ email: ownerAEmail, tenant_id: tenantA._id })
    : null;
  const ownerBUser = await db.collection('users').findOne({ email: ownerBEmail });
  const staffAUser = tenantA
    ? await db.collection('users').findOne({ email: staffAEmail, tenant_id: tenantA._id })
    : null;

  if (!tenantA || !ownerAUser || !ownerBUser || !staffAUser) {
    await client.close();
    throw new Error('Required smoke users/tenant missing. Run smoke-tenant-isolation.ts and smoke-role-access.ts first.');
  }

  const ownerAJar = await login(ownerAEmail, ownerAPass);
  const ownerBJar = await login(ownerBEmail, ownerBPass);
  const staffAJar = await login(staffAEmail, staffAPass);

  const originalMaxSeats = Number((tenantA as any).max_seats || 5);
  const results: Record<string, any> = {};

  try {
    // Edge 1: Seat count includes pending members.
    const currentSeatUsage = await db.collection('team_members').countDocuments({
      tenant_id: tenantA._id,
      status: { $ne: 'removed' },
    });
    await db.collection('tenants').updateOne(
      { _id: tenantA._id },
      { $set: { max_seats: currentSeatUsage + 1, updated_at: new Date().toISOString() } }
    );
    const ts1 = Date.now();

    const invite1 = await fetch(`${BASE_URL}/api/team/invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(ownerAJar) },
      body: JSON.stringify({ email: `pending.one.${ts1}@example.com`, name: 'Pending One' }),
    });
    const invite2 = await fetch(`${BASE_URL}/api/team/invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(ownerAJar) },
      body: JSON.stringify({ email: `pending.two.${ts1}@example.com`, name: 'Pending Two' }),
    });
    results.pending_seat_count = {
      firstInviteStatus: invite1.status,
      secondInviteStatus: invite2.status,
      passed: invite1.status === 201 && invite2.status === 403,
    };

    // Edge 2: max_seats = 0 blocks invites.
    await db.collection('tenants').updateOne({ _id: tenantA._id }, { $set: { max_seats: 0, updated_at: new Date().toISOString() } });
    const inviteZero = await fetch(`${BASE_URL}/api/team/invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(ownerAJar) },
      body: JSON.stringify({ email: `seat.zero.${Date.now()}@example.com`, name: 'Seat Zero' }),
    });
    results.max_seats_zero = {
      inviteStatus: inviteZero.status,
      passed: inviteZero.status === 403,
    };

    // Restore normal seats for next edges.
    await db.collection('tenants').updateOne({ _id: tenantA._id }, { $set: { max_seats: 5, updated_at: new Date().toISOString() } });

    // Edge 3: revoked membership cannot accept old invite.
    const revokedEmail = `revoked.${Date.now()}@example.com`;
    const revokedInvite = await fetch(`${BASE_URL}/api/team/invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(ownerAJar) },
      body: JSON.stringify({ email: revokedEmail, name: 'Revoked User' }),
    });

    let revokedAcceptStatus = -1;
    if (revokedInvite.status === 201) {
      const invitedUser = await db.collection('users').findOne({ email: revokedEmail, tenant_id: tenantA._id });
      const inviteTokenDoc = await db.collection('invite_tokens')
        .find({ email: revokedEmail, tenant_id: tenantA._id })
        .sort({ created_at: -1 })
        .limit(1)
        .next();

      if (invitedUser && inviteTokenDoc?.token) {
        await fetch(`${BASE_URL}/api/team/${String(invitedUser._id)}`, {
          method: 'DELETE',
          headers: { cookie: cookieHeader(ownerAJar) },
        });
        const acceptRes = await fetch(`${BASE_URL}/api/invite/${inviteTokenDoc.token}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: 'NewPassword!123' }),
        });
        revokedAcceptStatus = acceptRes.status;
      }
    }
    results.revoked_invite = {
      inviteStatus: revokedInvite.status,
      acceptStatusAfterRemoval: revokedAcceptStatus,
      passed: revokedInvite.status === 201 && revokedAcceptStatus === 409,
    };

    // Edge 4: cross-tenant nested resource access blocked.
    const clientCreate = await fetch(`${BASE_URL}/api/clients`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookieHeader(ownerAJar) },
      body: JSON.stringify({
        name: `Edge Client ${Date.now()}`,
        email: `edge.client.${Date.now()}@example.com`,
        phone: '0712345678',
      }),
    });
    const clientJson = await clientCreate.json() as any;
    const clientId = clientJson?.client?.id;
    const ownerBNotesStatus = clientId
      ? (await fetch(`${BASE_URL}/api/clients/${clientId}/notes`, {
          method: 'GET',
          headers: { cookie: cookieHeader(ownerBJar) },
        })).status
      : -1;
    results.cross_tenant_nested = {
      createStatus: clientCreate.status,
      ownerBNotesStatus,
      passed: clientCreate.status === 201 && ownerBNotesStatus === 404,
    };

    // Edge 5: staff cannot remove team members.
    const staffDelete = await fetch(`${BASE_URL}/api/team/${String(ownerAUser._id)}`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader(staffAJar) },
    });
    results.staff_cannot_remove_member = {
      deleteStatus: staffDelete.status,
      passed: staffDelete.status === 403,
    };
  } finally {
    await db.collection('tenants').updateOne(
      { _id: tenantA._id },
      { $set: { max_seats: originalMaxSeats, updated_at: new Date().toISOString() } }
    );
    await client.close();
  }

  const passed = Object.values(results).every((r: any) => r?.passed === true);
  console.log(JSON.stringify({ passed, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
