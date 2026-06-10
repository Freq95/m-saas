/**
 * onboard-assistant.js — manually activate assistant accounts in a tenant when
 * the email invite link could not be used.
 *
 * SAFETY:
 *   - Dry-run by default. Pass --commit to actually write.
 *   - Idempotent: updates existing pending rows in place (matches the schema
 *     produced by /api/team/invite + /api/invite/[token]); never creates
 *     duplicate users/members.
 *   - Scoped: only touches `users`, `team_members`, and `invite_tokens` rows
 *     for the specific invitee emails in the resolved owner's tenant. Never
 *     reads or writes patient data.
 *
 * USAGE:
 *   node scripts/onboard-assistant.js            # dry-run (read-only)
 *   node scripts/onboard-assistant.js --commit   # apply changes
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const DEFAULT_DB_NAME = 'm-saas';
const COMMIT = process.argv.includes('--commit');

// ── Configuration ───────────────────────────────────────────────────────────
const OWNER_EMAIL = 'drandreeanicolescu@gmail.com';
const INVITEE_EMAILS = ['matacheelena30@gmail.com', 'matachelena30@gmail.com'];
const TEMP_PASSWORD = '12345678'; // user will change after first login
const ASSISTANT_ROLE = 'asistent';
const BCRYPT_COST = 12; // matches app/api/invite/[token]/route.ts

function getDbName(uri) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try {
    const dbName = new URL(uri).pathname.replace(/^\//, '');
    if (dbName) return dbName;
  } catch { /* ignore */ }
  return DEFAULT_DB_NAME;
}

const norm = (e) => e.toLowerCase().trim();
const nameFromEmail = (e) => {
  const local = e.split('@')[0].replace(/[._-]+/g, ' ').trim();
  return local.replace(/\b\w/g, (c) => c.toUpperCase());
};

// Faithful port of getNextNumericId from lib/db/mongo-utils.ts so manually
// created users get an `id` consistent with the app's counter sequence.
async function getNextNumericId(db, collectionName, idField = 'id') {
  const collection = db.collection(collectionName);
  const counters = db.collection('counters');
  const doc = await collection.find({ [idField]: { $type: 'number' } }).sort({ [idField]: -1 }).limit(1).next();
  const maxId = doc && doc[idField];
  const currentMax = typeof maxId === 'number' ? maxId : (typeof (doc && doc._id) === 'number' ? doc._id : 0);
  const counterKey = `${collectionName}:${idField}`;
  const nowIso = new Date().toISOString();
  await counters.updateOne({ _id: counterKey }, { $setOnInsert: { seq: currentMax, created_at: nowIso } }, { upsert: true });
  await counters.updateOne({ _id: counterKey }, { $max: { seq: currentMax }, $set: { updated_at: nowIso } });
  const result = await counters.findOneAndUpdate(
    { _id: counterKey },
    { $inc: { seq: 1 }, $set: { updated_at: new Date().toISOString() } },
    { upsert: true, returnDocument: 'after' }
  );
  const value = (result && result.value) || result;
  return typeof (value && value.seq) === 'number' ? value.seq : 1;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required.');

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(getDbName(uri));

  console.log(`\n${'='.repeat(70)}`);
  console.log(`onboard-assistant — ${COMMIT ? 'COMMIT (writing)' : 'DRY-RUN (read-only)'}`);
  console.log(`DB: ${getDbName(uri)}`);
  console.log(`${'='.repeat(70)}\n`);

  try {
    // 1) Resolve owner / dentist the assistants will be attached to.
    const owner = await db.collection('users').findOne({ email: norm(OWNER_EMAIL) });
    if (!owner) {
      console.error(`✗ Owner not found for ${OWNER_EMAIL}. Aborting — nothing written.`);
      return;
    }
    if (!['owner', 'dentist'].includes(owner.role) || owner.status === 'deleted') {
      console.error(`✗ ${OWNER_EMAIL} has role="${owner.role}", status="${owner.status}". An assistant must attach to an active owner/dentist. Aborting.`);
      return;
    }
    if (typeof owner.id !== 'number') {
      console.error(`✗ Owner has no numeric "id" field — cannot set assigned_dentist_user_ids. Aborting.`);
      return;
    }

    console.log('Owner / dentist resolved:');
    console.log(`  email:      ${owner.email}`);
    console.log(`  name:       ${owner.name || '(none)'}`);
    console.log(`  role:       ${owner.role}`);
    console.log(`  status:     ${owner.status}`);
    console.log(`  numeric id: ${owner.id}`);
    console.log(`  tenant_id:  ${owner.tenant_id}`);

    const tenant = await db.collection('tenants').findOne({ _id: owner.tenant_id });
    console.log(`  tenant:     ${tenant ? (tenant.name || '(unnamed)') + ` [status=${tenant.status}, seats=${tenant.max_seats}]` : 'NOT FOUND'}`);

    const activeMembers = await db.collection('team_members').countDocuments({ tenant_id: owner.tenant_id, status: { $ne: 'removed' } });
    console.log(`  active/pending members: ${activeMembers}${tenant ? ` / ${tenant.max_seats} seats` : ''}\n`);

    const passwordHash = COMMIT ? await bcrypt.hash(TEMP_PASSWORD, BCRYPT_COST) : '(dry-run, not hashed)';
    const nowIso = new Date().toISOString();

    // 2) Per invitee: discover current state, then upsert in commit mode.
    for (const raw of INVITEE_EMAILS) {
      const email = norm(raw);
      console.log(`${'-'.repeat(70)}`);
      console.log(`Invitee: ${email}`);

      const existingUser = await db.collection('users').findOne({ email, tenant_id: owner.tenant_id });
      const existingMember = await db.collection('team_members').findOne({ tenant_id: owner.tenant_id, email });

      console.log(`  existing user:   ${existingUser ? `yes (id=${existingUser.id}, status=${existingUser.status}, role=${existingUser.role})` : 'no'}`);
      console.log(`  existing member: ${existingMember ? `yes (status=${existingMember.status}, role=${existingMember.role}, assigned=${JSON.stringify(existingMember.assigned_dentist_user_ids || [])})` : 'no'}`);

      const resolvedName = (existingUser && existingUser.name) || nameFromEmail(email);

      if (!COMMIT) {
        console.log(`  → WOULD ${existingUser ? 'UPDATE' : 'CREATE'} user: role=${ASSISTANT_ROLE}, status=active, name="${resolvedName}", password set`);
        console.log(`  → WOULD ${existingMember ? 'UPDATE' : 'CREATE'} member: role=${ASSISTANT_ROLE}, status=active, assigned_dentist_user_ids=[${owner.id}]`);
        continue;
      }

      // ── users ──────────────────────────────────────────────────────────────
      let userObjectId;
      if (existingUser) {
        // A revived/legacy row may lack a numeric id (e.g. an old soft-deleted
        // 'staff' account). Auth + assignment scoping require one, so allocate
        // it here if missing.
        const numericUserId = typeof existingUser.id === 'number'
          ? existingUser.id
          : await getNextNumericId(db, 'users');
        await db.collection('users').updateOne(
          { _id: existingUser._id, tenant_id: owner.tenant_id },
          {
            $set: {
              id: numericUserId,
              email,
              name: resolvedName,
              role: ASSISTANT_ROLE,
              password_hash: passwordHash,
              status: 'active',
              updated_at: nowIso,
            },
            $inc: { session_version: 1 },
          }
        );
        userObjectId = existingUser._id;
        console.log(`  ✓ user updated (id=${numericUserId}${typeof existingUser.id !== 'number' ? ' — newly assigned' : ''})`);
      } else {
        const numericUserId = await getNextNumericId(db, 'users');
        const ins = await db.collection('users').insertOne({
          id: numericUserId,
          email,
          name: resolvedName,
          role: ASSISTANT_ROLE,
          password_hash: passwordHash,
          tenant_id: owner.tenant_id,
          status: 'active',
          session_version: 0,
          created_at: nowIso,
          updated_at: nowIso,
        });
        userObjectId = ins.insertedId;
        console.log(`  ✓ user created (id=${numericUserId})`);
      }

      // ── team_members (unique on tenant_id+user_id) ──────────────────────────
      const memberSet = {
        tenant_id: owner.tenant_id,
        user_id: userObjectId,
        email,
        role: ASSISTANT_ROLE,
        assigned_dentist_user_ids: [owner.id],
        status: 'active',
        accepted_at: nowIso,
        updated_at: nowIso,
      };
      if (existingMember) {
        await db.collection('team_members').updateOne(
          { _id: existingMember._id },
          { $set: memberSet }
        );
        console.log(`  ✓ member updated (assigned to dentist id=${owner.id})`);
      } else {
        await db.collection('team_members').insertOne({
          ...memberSet,
          invited_by: owner._id,
          invited_at: nowIso,
          created_at: nowIso,
        });
        console.log(`  ✓ member created (assigned to dentist id=${owner.id})`);
      }

      // ── consume any stale invite tokens for this email ──────────────────────
      const tok = await db.collection('invite_tokens').updateMany(
        { email, tenant_id: owner.tenant_id, used_at: null },
        { $set: { used_at: new Date() } }
      );
      if (tok.modifiedCount > 0) console.log(`  ✓ invalidated ${tok.modifiedCount} stale invite token(s)`);
    }

    console.log(`\n${'='.repeat(70)}`);
    if (COMMIT) {
      console.log('DONE. Both accounts are active assistants.');
      console.log(`Login: each email above, password "${TEMP_PASSWORD}" — change after first login.`);
      console.log('Reminder: delete the duplicate/typo email account once confirmed.');
    } else {
      console.log('DRY-RUN complete. No changes written. Re-run with --commit to apply.');
    }
    console.log(`${'='.repeat(70)}\n`);
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error('onboard-assistant failed:', err);
  process.exit(1);
});
