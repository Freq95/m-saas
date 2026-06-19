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
    await db.createCollection('treatment_plans').catch((error) => {
      if (error.codeName !== 'NamespaceExists') throw error;
    });
    await db.createCollection('treatment_plan_settings').catch((error) => {
      if (error.codeName !== 'NamespaceExists') throw error;
    });

    await db.collection('treatment_plans').createIndex(
      { tenant_id: 1, client_id: 1, user_id: 1 },
      { name: 'treatment_plans_by_client_owner' }
    );
    await db.collection('treatment_plans').createIndex(
      { tenant_id: 1, client_id: 1, created_at: -1 },
      { name: 'treatment_plans_by_client_recent' }
    );
    await db.collection('treatment_plan_settings').createIndex(
      { tenant_id: 1 },
      { unique: true, name: 'unique_treatment_plan_settings_per_tenant' }
    );

    console.log('Treatment plan collections and indexes created successfully.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Treatment plan migration failed:', error);
  process.exit(1);
});
