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
    // tooth_states — current snapshot per (client, tooth). Upserted on every event.
    await db.createCollection('tooth_states').catch((error) => {
      if (error.codeName !== 'NamespaceExists') throw error;
    });

    await db.collection('tooth_states').createIndex(
      { tenant_id: 1, client_id: 1, tooth_fdi: 1 },
      { unique: true, name: 'unique_tooth_state_per_client' }
    );
    await db.collection('tooth_states').createIndex(
      { tenant_id: 1, client_id: 1 },
      { name: 'tooth_states_by_client' }
    );

    // tooth_events — append-only history. Soft-deletable via deleted_at.
    await db.createCollection('tooth_events').catch((error) => {
      if (error.codeName !== 'NamespaceExists') throw error;
    });

    await db.collection('tooth_events').createIndex(
      { tenant_id: 1, client_id: 1, occurred_at: -1 },
      { name: 'tooth_events_by_client_recent' }
    );
    await db.collection('tooth_events').createIndex(
      { tenant_id: 1, client_id: 1, tooth_fdi: 1, occurred_at: -1 },
      { name: 'tooth_events_by_tooth_recent' }
    );

    console.log('Dental chart indexes created successfully.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Dental chart migration failed:', error);
  process.exit(1);
});
