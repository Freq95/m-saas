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
    await db.collection('team_members').createIndex(
      { tenant_id: 1 },
      {
        unique: true,
        partialFilterExpression: { role: 'owner', status: 'active' },
        name: 'unique_active_owner_per_tenant',
      }
    );
    console.log('Role expansion indexes created successfully.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Role expansion migration failed:', error);
  process.exit(1);
});
