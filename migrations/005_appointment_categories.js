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
    await db.createCollection('appointment_categories').catch((error) => {
      if (error.codeName !== 'NamespaceExists') throw error;
    });

    await db.collection('appointment_categories').createIndex(
      { tenant_id: 1, user_id: 1, key: 1 },
      { unique: true, name: 'unique_category_key_per_dentist' }
    );
    await db.collection('appointment_categories').createIndex(
      { tenant_id: 1, user_id: 1, position: 1 },
      { name: 'category_order_per_dentist' }
    );

    console.log('Appointment category indexes created successfully.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Appointment category migration failed:', error);
  process.exit(1);
});
