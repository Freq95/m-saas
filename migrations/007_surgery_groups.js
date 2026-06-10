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
    // surgery_groups — multi-tooth surgical annotations. One row per surgery
    // referencing an array of FDIs plus a shared comment. Used to render the
    // gray gum segment + comment text on the odontogram.
    await db.createCollection('surgery_groups').catch((error) => {
      if (error.codeName !== 'NamespaceExists') throw error;
    });

    await db.collection('surgery_groups').createIndex(
      { tenant_id: 1, client_id: 1, created_at: -1 },
      { name: 'surgery_groups_by_client_recent' }
    );
    await db.collection('surgery_groups').createIndex(
      { tenant_id: 1, client_id: 1, tooth_fdis: 1 },
      { name: 'surgery_groups_by_tooth' }
    );

    console.log('Surgery groups indexes created successfully.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Surgery groups migration failed:', error);
  process.exit(1);
});
