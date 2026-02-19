/**
 * Backfill deleted_at for legacy deleted clients.
 *
 * Legacy format:
 *   { status: 'deleted' }
 *
 * New format:
 *   { deleted_at: '<ISO timestamp>' }
 *
 * Usage:
 *   node scripts/migrations/backfill-clients-deleted-at.js          # dry-run
 *   node scripts/migrations/backfill-clients-deleted-at.js --apply  # apply changes
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = process.env.MONGODB_DB || 'm-saas';
const APPLY = process.argv.includes('--apply');

if (!MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function run() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DATABASE_NAME);
    const collection = db.collection('clients');

    const filter = {
      status: 'deleted',
      deleted_at: { $exists: false },
    };

    const legacyDeleted = await collection.find(filter).toArray();
    const nowIso = new Date().toISOString();

    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Found legacy deleted clients: ${legacyDeleted.length}`);

    if (legacyDeleted.length === 0) {
      console.log('Nothing to migrate.');
      return;
    }

    let updated = 0;
    let failed = 0;

    for (const doc of legacyDeleted) {
      const deletedAt =
        toIsoOrNull(doc.updated_at) ||
        toIsoOrNull(doc.created_at) ||
        nowIso;

      if (!APPLY) {
        console.log(`- id=${doc.id} -> deleted_at=${deletedAt}`);
        continue;
      }

      try {
        const result = await collection.updateOne(
          { _id: doc._id },
          {
            $set: {
              deleted_at: deletedAt,
              updated_at: nowIso,
            },
            $unset: {
              status: '',
              source: '',
            },
          }
        );
        if (result.modifiedCount > 0) updated += 1;
      } catch (error) {
        failed += 1;
        console.error(`Failed to migrate client id=${doc.id}:`, error.message || error);
      }
    }

    if (!APPLY) {
      console.log('Dry-run complete. Re-run with --apply to persist changes.');
      return;
    }

    console.log(`Updated: ${updated}`);
    console.log(`Failed: ${failed}`);

    const remaining = await collection.countDocuments(filter);
    console.log(`Remaining legacy deleted clients: ${remaining}`);
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Failed to backfill deleted_at on clients:', error);
  process.exit(1);
});
