/**
 * Normalize blocked_times date fields to ISO strings.
 *
 * Usage:
 *   node scripts/migrations/normalize-blocked-times-dates.js
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = process.env.MONGODB_DB || 'm-saas';

if (!MONGODB_URI) {
  console.error('MONGODB_URI is required');
  process.exit(1);
}

function toIso(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function run() {
  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    const db = client.db(DATABASE_NAME);
    const collection = db.collection('blocked_times');

    const cursor = collection.find({});
    let scanned = 0;
    let updated = 0;
    let skipped = 0;

    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      if (!doc) break;
      scanned += 1;

      const start = toIso(doc.start_time);
      const end = toIso(doc.end_time);

      if (!start || !end) {
        skipped += 1;
        continue;
      }

      const needsUpdate = doc.start_time !== start || doc.end_time !== end;
      if (!needsUpdate) continue;

      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            start_time: start,
            end_time: end,
            updated_at: new Date().toISOString(),
          },
        }
      );
      updated += 1;
    }

    console.log(`Scanned: ${scanned}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (invalid dates): ${skipped}`);
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Failed to normalize blocked_times:', error);
  process.exit(1);
});
