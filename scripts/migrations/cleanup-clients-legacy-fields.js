/**
 * Cleanup legacy client fields on non-deleted clients.
 *
 * Removes legacy fields:
 *   - status
 *   - source
 *
 * Scope:
 *   - only non-deleted clients (deleted_at does not exist)
 *
 * Usage:
 *   node scripts/migrations/cleanup-clients-legacy-fields.js          # dry-run
 *   node scripts/migrations/cleanup-clients-legacy-fields.js --apply  # apply changes
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

async function run() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DATABASE_NAME);
    const collection = db.collection('clients');

    const filter = {
      deleted_at: { $exists: false },
      $or: [
        { status: { $exists: true } },
        { source: { $exists: true } },
      ],
    };

    const docs = await collection.find(filter).project({ id: 1, status: 1, source: 1 }).toArray();
    console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Found non-deleted clients with legacy fields: ${docs.length}`);

    if (!APPLY) {
      for (const doc of docs.slice(0, 30)) {
        console.log(`- id=${doc.id} status=${String(doc.status)} source=${String(doc.source)}`);
      }
      if (docs.length > 30) {
        console.log(`...and ${docs.length - 30} more`);
      }
      console.log('Dry-run complete. Re-run with --apply to persist changes.');
      return;
    }

    if (docs.length === 0) {
      console.log('Nothing to cleanup.');
      return;
    }

    const now = new Date().toISOString();
    const result = await collection.updateMany(
      filter,
      {
        $unset: {
          status: '',
          source: '',
        },
        $set: {
          updated_at: now,
        },
      }
    );

    console.log(`Matched: ${result.matchedCount}`);
    console.log(`Modified: ${result.modifiedCount}`);
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Failed to cleanup legacy client fields:', error);
  process.exit(1);
});
