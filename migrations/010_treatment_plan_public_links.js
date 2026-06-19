require('dotenv').config();
const { MongoClient } = require('mongodb');

const DEFAULT_DB_NAME = 'm-saas';

function getDbName(uri) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try {
    const url = new URL(uri);
    const dbName = url.pathname ? url.pathname.replace(/^\//, '') : '';
    if (dbName) return dbName;
  } catch {
    // ignore
  }
  return DEFAULT_DB_NAME;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required to run MongoDB migrations.');
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(getDbName(uri));

  try {
    await db.createCollection('treatment_plan_public_links').catch((error) => {
      if (error.codeName !== 'NamespaceExists') throw error;
    });

    await db.collection('treatment_plan_public_links').updateMany(
      { expires_at: { $type: 'string' }, expires_at_date: { $exists: false } },
      [
        {
          $set: {
            expires_at_date: {
              $dateFromString: {
                dateString: '$expires_at',
                onError: null,
                onNull: null,
              },
            },
          },
        },
      ]
    );

    await db.collection('treatment_plan_public_links').createIndex(
      { token_hash: 1 },
      { unique: true, name: 'treatment_plan_public_links_token_hash' }
    );
    await db.collection('treatment_plan_public_links').createIndex(
      { tenant_id: 1, user_id: 1, client_id: 1, plan_id: 1, revoked_at: 1, expires_at: 1 },
      { name: 'treatment_plan_public_links_by_plan_active' }
    );
    await db.collection('treatment_plan_public_links').createIndex(
      { expires_at_date: 1 },
      { expireAfterSeconds: 0, name: 'treatment_plan_public_links_expires_at_ttl' }
    );

    console.log('Treatment plan public link indexes created successfully.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Treatment plan public link migration failed:', error);
  process.exit(1);
});
