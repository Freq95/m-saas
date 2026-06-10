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
    // bridge_groups — clinical dental bridges spanning 2+ teeth. One row per
    // bridge referencing an array of FDIs (abutments + pontics). Rendered as a
    // connector arc above the involved teeth on the odontogram.
    await db.createCollection('bridge_groups').catch((error) => {
      if (error.codeName !== 'NamespaceExists') throw error;
    });

    await db.collection('bridge_groups').createIndex(
      { tenant_id: 1, client_id: 1, created_at: -1 },
      { name: 'bridge_groups_by_client_recent' }
    );
    await db.collection('bridge_groups').createIndex(
      { tenant_id: 1, client_id: 1, tooth_fdis: 1 },
      { name: 'bridge_groups_by_tooth' }
    );

    console.log('Bridge groups indexes created successfully.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Bridge groups migration failed:', error);
  process.exit(1);
});
