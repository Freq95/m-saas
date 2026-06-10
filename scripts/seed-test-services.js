/**
 * seed-test-services.js — populate the QA test tenant's owner with a handful of
 * dental services so the appointment service-picker has something to search.
 *
 *   node scripts/seed-test-services.js            # upsert services (idempotent)
 *   node scripts/seed-test-services.js --cleanup  # remove only these seeded services
 *
 * Scoped strictly to the QA test tenant created by create-test-tenant.js — it
 * looks up that tenant by slug and the owner by email, and never touches anything
 * outside that scope.
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const DEFAULT_DB_NAME = 'm-saas';
const CLEANUP = process.argv.includes('--cleanup');

const TENANT_SLUG = 'qa-test-claude';
const OWNER_EMAIL = 'claude.qa.owner@densa-qa.test';

// Romanian names with diacritics on purpose, to prove diacritic-insensitive
// search + alphabetical (ro collation) sorting in the mobile picker.
const SERVICES = [
  { name: 'Consultație', duration_minutes: 20, price: 100 },
  { name: 'Consultație parodontală', duration_minutes: 60, price: 200 },
  { name: 'Detartraj + periaj + air flow', duration_minutes: 30, price: 300 },
  { name: 'Albire', duration_minutes: 60, price: 1000 },
  { name: 'Amprentare', duration_minutes: 60, price: null },
  { name: 'Cimentare lucrare', duration_minutes: 30, price: null },
  { name: 'Drenaj / pansament calmant', duration_minutes: 30, price: 200 },
  { name: 'Evaluare parodontală', duration_minutes: 30, price: 200 },
  { name: 'Finalizare tratamente endodontice', duration_minutes: 60, price: 400 },
  { name: 'Manoperă estetică - stras', duration_minutes: 30, price: 200 },
  { name: 'Ablație lucrare / element', duration_minutes: 30, price: 200 },
];

function getDbName(uri) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try { const d = new URL(uri).pathname.replace(/^\//, ''); if (d) return d; } catch { /* ignore */ }
  return DEFAULT_DB_NAME;
}

async function getNextNumericId(db, collection) {
  const latest = await db.collection(collection).find({ id: { $type: 'number' } }).sort({ id: -1 }).limit(1).next();
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
    if (!tenant) throw new Error('QA test tenant not found — run create-test-tenant.js first.');
    const owner = await db.collection('users').findOne({ email: OWNER_EMAIL });
    if (!owner || typeof owner.id !== 'number') throw new Error('QA owner not found or missing numeric id.');

    const scope = { tenant_id: tenant._id, user_id: owner.id };

    if (CLEANUP) {
      const r = await db.collection('services').deleteMany({ ...scope, name: { $in: SERVICES.map((s) => s.name) } });
      console.log(`Removed ${r.deletedCount} seeded services.`);
      return;
    }

    const now = new Date().toISOString();
    let created = 0;
    let reused = 0;
    for (const svc of SERVICES) {
      const existing = await db.collection('services').findOne({ ...scope, name: svc.name });
      if (existing) { reused++; continue; }
      const id = await getNextNumericId(db, 'services');
      await db.collection('services').insertOne({
        _id: id, id, tenant_id: scope.tenant_id, user_id: scope.user_id,
        name: svc.name, duration_minutes: svc.duration_minutes, price: svc.price,
        description: null, created_at: now, updated_at: now,
      });
      created++;
    }
    console.log(`Services for owner ${OWNER_EMAIL} (id=${owner.id}): ${created} created, ${reused} already existed.`);
  } finally {
    await client.close();
  }
}

run().catch((e) => { console.error('seed-test-services failed:', e); process.exit(1); });
