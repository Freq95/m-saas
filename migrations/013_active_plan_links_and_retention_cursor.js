require('dotenv').config();
const { MongoClient } = require('mongodb');

const DEFAULT_DB_NAME = 'm-saas';

function getDbName(uri) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try { return new URL(uri).pathname.replace(/^\//, '') || DEFAULT_DB_NAME; } catch { return DEFAULT_DB_NAME; }
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required to run MongoDB migrations.');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(getDbName(uri));
  try {
    const links = db.collection('treatment_plan_public_links');
    const duplicateGroups = await links.aggregate([
      { $match: { revoked_at: { $exists: false } } },
      { $sort: { updated_at: -1, created_at: -1 } },
      {
        $group: {
          _id: { tenant_id: '$tenant_id', user_id: '$user_id', client_id: '$client_id', plan_id: '$plan_id' },
          keep: { $first: '$_id' },
          duplicates: { $push: '$_id' },
        },
      },
      { $match: { 'duplicates.1': { $exists: true } } },
    ]).toArray();
    const now = new Date().toISOString();
    for (const group of duplicateGroups) {
      await links.updateMany(
        { _id: { $in: group.duplicates.filter((id) => String(id) !== String(group.keep)) } },
        { $set: { revoked_at: now, updated_at: now }, $unset: { active: '' } }
      );
    }
    // MongoDB partial-index filters can't express "revoked_at absent" ($exists:false),
    // so active links carry an explicit `active: true` flag (maintained by the app on
    // issue/revoke). Normalize existing rows, then index on that supported predicate.
    await links.updateMany({ revoked_at: { $exists: false } }, { $set: { active: true } });
    await links.updateMany({ revoked_at: { $exists: true } }, { $unset: { active: '' } });
    await links.createIndex(
      { tenant_id: 1, user_id: 1, client_id: 1, plan_id: 1 },
      {
        unique: true,
        partialFilterExpression: { active: true },
        name: 'treatment_plan_public_links_one_active',
      }
    );
    await db.collection('clients').createIndex(
      { deleted_at: 1, id: 1, retention_legal_hold: 1 },
      { name: 'clients_retention_cursor' }
    );
    await db.collection('erasure_storage_cleanup_jobs').createIndex(
      { status: 1, created_at: 1 },
      { name: 'erasure_storage_cleanup_pending' }
    );
    console.log('Active plan-link and retention safety indexes created successfully.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Migration 013 failed:', error);
  process.exit(1);
});
