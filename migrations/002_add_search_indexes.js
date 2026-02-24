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
  const dbName = getDbName(uri);
  await client.connect();
  const db = client.db(dbName);

  try {
    await db.collection('conversations').createIndex(
      { tenant_id: 1, user_id: 1, contact_name: 1 },
      { name: 'conversations_tenant_user_contact_name' }
    );

    await db.collection('appointments').createIndex(
      { tenant_id: 1, user_id: 1, client_name: 1 },
      { name: 'appointments_tenant_user_client_name' }
    );

    console.log('Search support indexes created.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Search index migration failed:', error);
  process.exit(1);
});
