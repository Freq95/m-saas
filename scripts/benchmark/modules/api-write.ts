import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { runEndpointBenchmark, runSnapshot, warmupBenchmark } from '../lib/http-bench';
import { BenchmarkContext, EdgeCheckResult, EndpointMetric, ModuleMetrics, SnapshotMetric } from '../lib/types';
import { withBenchmarkBypassHeaders } from '../lib/benchmark-headers';

function uniqueEmail(prefix: string, runId: string, index?: number): string {
  return `${prefix}.${runId}${index === undefined ? '' : `.${index}`}.benchmark@example.com`;
}

function randomPhone(index: number): string {
  return `07${String(10000000 + (index % 89999999)).slice(-8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

async function withDb<T>(handler: (db: any) => Promise<T>): Promise<T> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required for benchmark edge checks');
  const dbName = process.env.MONGODB_DB || 'm-saas';
  const client = new MongoClient(uri);
  await client.connect();
  try {
    return await handler(client.db(dbName));
  } finally {
    await client.close();
  }
}

export async function runApiWriteModule(context: BenchmarkContext): Promise<ModuleMetrics> {
  const metrics: EndpointMetric[] = [];
  const snapshots: SnapshotMetric[] = [];
  const clientEndpoint = context.config.endpoints.apiWrite.clients;
  const actor = context.actors[clientEndpoint.actor];
  const writeSeed = `${Date.now()}`;

  await warmupBenchmark(
    context.config.warmup.requestsPerEndpoint,
    async (index) => ({
      method: 'POST',
      url: `${context.baseUrl}${clientEndpoint.path}`,
      headers: {
        'content-type': 'application/json',
        cookie: actor.cookieHeader,
      },
      body: JSON.stringify({
        name: `Bench Warmup Client ${index}`,
        email: uniqueEmail('client.warmup', writeSeed, index),
        phone: randomPhone(index),
        notes: 'benchmark:warmup',
      }),
      expectedStatus: [200, 201],
    }),
    context.config.timeouts.requestMs
  );

  for (const [tierName, tierConfig] of Object.entries(context.config.tiers)) {
    const metric = await runEndpointBenchmark({
      endpointName: clientEndpoint.name,
      path: clientEndpoint.path,
      tier: tierName,
      requests: tierConfig.requests,
      concurrency: tierConfig.concurrency,
      timeoutMs: context.config.timeouts.requestMs,
      requestFactory: async (index) => ({
        method: 'POST',
        url: `${context.baseUrl}${clientEndpoint.path}`,
        headers: {
          'content-type': 'application/json',
          cookie: actor.cookieHeader,
        },
        body: JSON.stringify({
          name: `Benchmark Client ${index}`,
          email: uniqueEmail(`client.${tierName}`, writeSeed, index),
          phone: randomPhone(index),
          notes: 'benchmark:write',
        }),
        expectedStatus: [200, 201],
      }),
    });
    metrics.push(metric);
  }

  const rawCreateResponse = await fetch(`${context.baseUrl}${clientEndpoint.path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: actor.cookieHeader,
      ...withBenchmarkBypassHeaders(),
    },
    body: JSON.stringify({
      name: 'Benchmark Read-After-Write',
      email: uniqueEmail('client.raw', writeSeed),
      phone: randomPhone(9999),
      notes: `benchmark:${context.config.runtimeLabel}`,
    }),
  });
  let createdEmail = uniqueEmail('client.raw', writeSeed);
  if (rawCreateResponse.ok) {
    const createdJson = (await rawCreateResponse.json()) as any;
    createdEmail = String(createdJson?.client?.email || createdEmail);
  }

  const readAfterWrite = await runSnapshot(
    'api.read-after-write.clients',
    'GET',
    context.config.endpoints.apiWrite.readAfterWritePath,
    `${context.baseUrl}${context.config.endpoints.apiWrite.readAfterWritePath}${encodeURIComponent(createdEmail)}`,
    context.config.timeouts.requestMs,
    { cookie: actor.cookieHeader },
    undefined,
    200
  );
  snapshots.push(readAfterWrite);

  const teamInviteEndpoint = context.config.endpoints.apiWrite.teamInvite;
  const teamActor = context.actors[teamInviteEndpoint.actor];
  const inviteSnapshot = await runSnapshot(
    teamInviteEndpoint.name,
    'POST',
    teamInviteEndpoint.path,
    `${context.baseUrl}${teamInviteEndpoint.path}`,
    context.config.timeouts.requestMs,
    {
      'content-type': 'application/json',
      cookie: teamActor.cookieHeader,
    },
    JSON.stringify({
      email: uniqueEmail('invite.single', writeSeed),
      name: 'Benchmark Invite',
    }),
    [201, 403, 409]
  );
  snapshots.push(inviteSnapshot);

  return {
    endpointMetrics: metrics,
    snapshots,
  };
}

export async function runEdgeChecks(context: BenchmarkContext, runId: string): Promise<EdgeCheckResult[]> {
  const checks: EdgeCheckResult[] = [];
  const ownerA = context.actors.ownerA;
  const ownerB = context.actors.ownerB;
  const staffA = context.actors.staffA;
  const tenantAId = context.data.tenantAId;

  await withDb(async (db) => {
    const tenantCollection = db.collection('tenants');
    const teamCollection = db.collection('team_members');
    const userCollection = db.collection('users');
    const inviteTokens = db.collection('invite_tokens');
    const tenant = await tenantCollection.findOne({ _id: tenantAId });
    const originalMaxSeats = Number(tenant?.max_seats || 0);
    const edgeInviteOneEmail = uniqueEmail('edge.pending.one', runId);
    const edgeInviteTwoEmail = uniqueEmail('edge.pending.two', runId);

    try {
      const activeMembers = await teamCollection.countDocuments({
        tenant_id: tenantAId,
        status: { $ne: 'removed' },
      });
      await tenantCollection.updateOne(
        { _id: tenantAId },
        { $set: { max_seats: activeMembers + 1, updated_at: nowIso() } }
      );

      const inviteOne = await runSnapshot(
        'edge.seat-limit.first',
        'POST',
        '/api/team/invite',
        `${context.baseUrl}/api/team/invite`,
        context.config.timeouts.requestMs,
        { 'content-type': 'application/json', cookie: ownerA.cookieHeader },
        JSON.stringify({ email: edgeInviteOneEmail, name: 'Edge Pending One' }),
        201
      );
      const inviteTwo = await runSnapshot(
        'edge.seat-limit.second',
        'POST',
        '/api/team/invite',
        `${context.baseUrl}/api/team/invite`,
        context.config.timeouts.requestMs,
        { 'content-type': 'application/json', cookie: ownerA.cookieHeader },
        JSON.stringify({ email: edgeInviteTwoEmail, name: 'Edge Pending Two' }),
        403
      );
      checks.push({
        name: 'seat-limit-pending-members',
        passed: inviteOne.ok && inviteTwo.ok,
        details: {
          firstInviteStatus: inviteOne.status,
          firstInviteMs: inviteOne.durationMs,
          secondInviteStatus: inviteTwo.status,
          secondInviteMs: inviteTwo.durationMs,
        },
      });

      await teamCollection.deleteMany({ tenant_id: tenantAId, email: { $in: [edgeInviteOneEmail, edgeInviteTwoEmail] } });
      await inviteTokens.deleteMany({ tenant_id: tenantAId, email: { $in: [edgeInviteOneEmail, edgeInviteTwoEmail] } });
      await userCollection.deleteMany({ tenant_id: tenantAId, email: { $in: [edgeInviteOneEmail, edgeInviteTwoEmail] } });

      await tenantCollection.updateOne(
        { _id: tenantAId },
        { $set: { max_seats: Math.max(activeMembers + 10, 10), updated_at: nowIso() } }
      );

      const revokedEmail = uniqueEmail('edge.revoked', runId);
      const inviteRevoked = await runSnapshot(
        'edge.revoked.invite',
        'POST',
        '/api/team/invite',
        `${context.baseUrl}/api/team/invite`,
        context.config.timeouts.requestMs,
        { 'content-type': 'application/json', cookie: ownerA.cookieHeader },
        JSON.stringify({ email: revokedEmail, name: 'Edge Revoked User' }),
        201
      );
      let deleteStatus = -1;
      let acceptStatus = -1;
      let acceptMs = -1;
      if (inviteRevoked.ok) {
        const invitedUser = await userCollection.findOne({ tenant_id: tenantAId, email: revokedEmail });
        const tokenDoc = await inviteTokens.find({ tenant_id: tenantAId, email: revokedEmail }).sort({ created_at: -1 }).limit(1).next();
        if (invitedUser?._id && tokenDoc?.token) {
          const deleteMember = await runSnapshot(
            'edge.revoked.remove-member',
            'DELETE',
            `/api/team/${String(invitedUser._id)}`,
            `${context.baseUrl}/api/team/${String(invitedUser._id)}`,
            context.config.timeouts.requestMs,
            { cookie: ownerA.cookieHeader },
            undefined,
            200
          );
          deleteStatus = deleteMember.status;

          const acceptInvite = await runSnapshot(
            'edge.revoked.accept',
            'POST',
            `/api/invite/${tokenDoc.token}`,
            `${context.baseUrl}/api/invite/${tokenDoc.token}`,
            context.config.timeouts.requestMs,
            { 'content-type': 'application/json' },
            JSON.stringify({ password: 'NewPass!12345' }),
            409
          );
          acceptStatus = acceptInvite.status;
          acceptMs = acceptInvite.durationMs;
        }
      }
      checks.push({
        name: 'revoked-invite-rejected',
        passed: inviteRevoked.ok && deleteStatus === 200 && acceptStatus === 409,
        details: {
          inviteStatus: inviteRevoked.status,
          inviteMs: inviteRevoked.durationMs,
          removeStatus: deleteStatus,
          acceptStatus,
          acceptMs,
        },
      });

      const createClientRes = await fetch(`${context.baseUrl}/api/clients`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: ownerA.cookieHeader,
          ...withBenchmarkBypassHeaders(),
        },
        body: JSON.stringify({
          name: `Edge Cross Tenant ${runId}`,
          email: uniqueEmail('edge.cross.tenant', runId),
          phone: randomPhone(4242),
          notes: 'benchmark:edge',
        }),
      });
      let ownerBStatus = -1;
      let clientId: number | null = null;
      if (createClientRes.ok) {
        const json = (await createClientRes.json()) as any;
        clientId = Number(json?.client?.id || 0) || null;
      }
      if (clientId) {
        const crossAccess = await runSnapshot(
          'edge.cross-tenant.nested',
          'GET',
          `/api/clients/${clientId}/notes`,
          `${context.baseUrl}/api/clients/${clientId}/notes`,
          context.config.timeouts.requestMs,
          { cookie: ownerB.cookieHeader },
          undefined,
          [403, 404]
        );
        ownerBStatus = crossAccess.status;
      }
      checks.push({
        name: 'cross-tenant-nested-denied',
        passed: (createClientRes.status === 200 || createClientRes.status === 201) && (ownerBStatus === 403 || ownerBStatus === 404),
        details: {
          createStatus: createClientRes.status,
          ownerBStatus,
          clientId,
        },
      });

      const forbiddenChecks = await Promise.all([
        runSnapshot(
          'edge.staff.forbidden.team',
          'GET',
          '/api/team',
          `${context.baseUrl}/api/team`,
          context.config.timeouts.requestMs,
          { cookie: staffA.cookieHeader },
          undefined,
          403
        ),
        runSnapshot(
          'edge.staff.forbidden.invite',
          'POST',
          '/api/team/invite',
          `${context.baseUrl}/api/team/invite`,
          context.config.timeouts.requestMs,
          { 'content-type': 'application/json', cookie: staffA.cookieHeader },
          JSON.stringify({ email: uniqueEmail('edge.staff.invite', runId), name: 'Forbidden Staff Invite' }),
          403
        ),
        runSnapshot(
          'edge.staff.forbidden.settings',
          'GET',
          '/api/settings/email-integrations',
          `${context.baseUrl}/api/settings/email-integrations`,
          context.config.timeouts.requestMs,
          { cookie: staffA.cookieHeader },
          undefined,
          403
        ),
      ]);
      checks.push({
        name: 'staff-forbidden-endpoints',
        passed: forbiddenChecks.every((check) => check.ok),
        details: {
          statuses: forbiddenChecks.map((check) => ({ name: check.name, status: check.status, durationMs: check.durationMs })),
        },
      });
    } finally {
      await tenantCollection.updateOne(
        { _id: tenantAId },
        { $set: { max_seats: originalMaxSeats, updated_at: nowIso() } }
      );
      await teamCollection.deleteMany({
        tenant_id: tenantAId,
        email: {
          $in: [
            edgeInviteOneEmail,
            edgeInviteTwoEmail,
            uniqueEmail('edge.revoked', runId),
            uniqueEmail('edge.staff.invite', runId),
          ],
        },
      });
      await inviteTokens.deleteMany({
        tenant_id: tenantAId,
        email: {
          $in: [edgeInviteOneEmail, edgeInviteTwoEmail, uniqueEmail('edge.revoked', runId)],
        },
      });
      await userCollection.deleteMany({
        tenant_id: tenantAId,
        email: {
          $in: [edgeInviteOneEmail, edgeInviteTwoEmail, uniqueEmail('edge.revoked', runId), uniqueEmail('edge.staff.invite', runId)],
        },
      });
    }
  });

  return checks;
}
