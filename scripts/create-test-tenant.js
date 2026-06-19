/**
 * create-test-tenant.js — spin up an ISOLATED test clinic (tenant) with an
 * active owner + assistant, for QA on production without touching real clinics.
 *
 *   node scripts/create-test-tenant.js            # create (idempotent)
 *   node scripts/create-test-tenant.js --cleanup  # delete the test tenant + ALL its data
 *
 * The test tenant is fully isolated: every record (clients, appointments,
 * dental, services, …) created during testing lives under this tenant_id and
 * is removed by --cleanup. Real clinics are never touched.
 */

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const DEFAULT_DB_NAME = 'm-saas';
const CLEANUP = process.argv.includes('--cleanup');

// ── Test identities ──────────────────────────────────────────────────────────
const TENANT_NAME = 'QA Test — Claude';
const TENANT_SLUG = 'qa-test-claude';
const OWNER_EMAIL = 'claude.qa.owner@densa-qa.test';
const OWNER_NAME = 'QA Owner (Claude)';
const ASSISTANT_EMAIL = 'claude.qa.asistent@densa-qa.test';
const ASSISTANT_NAME = 'QA Asistent (Claude)';
const PASSWORD = 'QaDensa!2026';
const BCRYPT_COST = 12;

// Collections that carry a tenant_id and must be purged on cleanup.
const TENANT_SCOPED = [
  'clients', 'appointments', 'services', 'conversations', 'messages',
  'client_notes', 'contact_notes', 'client_files', 'contact_files',
  'reminders', 'blocked_times', 'calendars', 'appointment_categories',
  'tooth_states', 'tooth_events', 'surgery_groups', 'bridge_groups',
  'treatment_plans', 'treatment_plan_settings',
  'notifications', 'message_attachments', 'conversation_tags',
];

function getDbName(uri) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try { const d = new URL(uri).pathname.replace(/^\//, ''); if (d) return d; } catch { /* ignore */ }
  return DEFAULT_DB_NAME;
}
async function getNextUserId(db) {
  const latest = await db.collection('users').find({ id: { $type: 'number' } }).sort({ id: -1 }).limit(1).next();
  return ((latest && latest.id) || 0) + 1;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI required.');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(getDbName(uri));

  try {
    const tenant = await db.collection('tenants').findOne({ slug: TENANT_SLUG });

    if (CLEANUP) {
      if (!tenant) { console.log('No test tenant found — nothing to clean.'); return; }
      const tid = tenant._id;
      let total = 0;
      for (const coll of TENANT_SCOPED) {
        const r = await db.collection(coll).deleteMany({ tenant_id: tid });
        if (r.deletedCount) { console.log(`  - ${coll}: ${r.deletedCount}`); total += r.deletedCount; }
      }
      const u = await db.collection('users').deleteMany({ tenant_id: tid });
      const m = await db.collection('team_members').deleteMany({ tenant_id: tid });
      const it = await db.collection('invite_tokens').deleteMany({ tenant_id: tid });
      await db.collection('tenants').deleteOne({ _id: tid });
      console.log(`  - users: ${u.deletedCount}, team_members: ${m.deletedCount}, invite_tokens: ${it.deletedCount}, tenant: 1`);
      console.log(`\n✓ Test tenant "${TENANT_NAME}" and ${total + u.deletedCount + m.deletedCount + 1} records removed.`);
      return;
    }

    const passwordHash = await bcrypt.hash(PASSWORD, BCRYPT_COST);
    const nowIso = new Date().toISOString();

    // ── Tenant ──
    let tenantId;
    if (tenant) {
      tenantId = tenant._id;
      await db.collection('tenants').updateOne({ _id: tenantId }, { $set: { status: 'active', plan: 'pro', max_seats: 5, updated_at: nowIso } });
      console.log(`Tenant exists, reused: ${tenantId}`);
    } else {
      tenantId = new ObjectId();
      await db.collection('tenants').insertOne({
        _id: tenantId, name: TENANT_NAME, slug: TENANT_SLUG, owner_id: null,
        plan: 'pro', max_seats: 5, status: 'active',
        settings: { timezone: 'Europe/Bucharest', currency: 'RON', working_hours: {} },
        created_at: nowIso, updated_at: nowIso,
      });
      console.log(`Tenant created: ${tenantId}`);
    }

    // ── Helper to upsert an active user + active membership ──
    async function upsertMember(email, name, role, assignedIds) {
      let user = await db.collection('users').findOne({ email });
      let userObjectId;
      let numericId;
      if (user) {
        numericId = typeof user.id === 'number' ? user.id : await getNextUserId(db);
        userObjectId = user._id;
        await db.collection('users').updateOne({ _id: user._id }, {
          $set: { id: numericId, email, name, role, tenant_id: tenantId, password_hash: passwordHash, status: 'active', updated_at: nowIso },
          $inc: { session_version: 1 },
        });
      } else {
        numericId = await getNextUserId(db);
        userObjectId = new ObjectId();
        await db.collection('users').insertOne({
          _id: userObjectId, id: numericId, email, password_hash: passwordHash, name, role,
          tenant_id: tenantId, status: 'active', session_version: 0, created_at: nowIso, updated_at: nowIso,
        });
      }
      const memberSet = {
        tenant_id: tenantId, user_id: userObjectId, email, role, status: 'active',
        accepted_at: nowIso, updated_at: nowIso,
      };
      if (assignedIds && assignedIds.length) memberSet.assigned_dentist_user_ids = assignedIds;
      const existingMember = await db.collection('team_members').findOne({ tenant_id: tenantId, user_id: userObjectId });
      if (existingMember) {
        await db.collection('team_members').updateOne({ _id: existingMember._id }, { $set: memberSet });
      } else {
        await db.collection('team_members').insertOne({ ...memberSet, invited_at: nowIso, created_at: nowIso });
      }
      return { userObjectId, numericId };
    }

    const owner = await upsertMember(OWNER_EMAIL, OWNER_NAME, 'owner', []);
    await db.collection('tenants').updateOne({ _id: tenantId }, { $set: { owner_id: owner.userObjectId } });
    const asst = await upsertMember(ASSISTANT_EMAIL, ASSISTANT_NAME, 'asistent', [owner.numericId]);

    console.log(`\n${'='.repeat(64)}`);
    console.log('✓ Test clinic ready (isolated).');
    console.log(`  Tenant:    ${TENANT_NAME}  [${tenantId}]`);
    console.log(`  Owner:     ${OWNER_EMAIL}  (id=${owner.numericId})`);
    console.log(`  Assistant: ${ASSISTANT_EMAIL}  (id=${asst.numericId}, assigned→${owner.numericId})`);
    console.log(`  Password:  ${PASSWORD}   (both accounts)`);
    console.log(`${'='.repeat(64)}\n  Run with --cleanup to remove everything afterwards.`);
  } finally {
    await client.close();
  }
}

run().catch((e) => { console.error('create-test-tenant failed:', e); process.exit(1); });
