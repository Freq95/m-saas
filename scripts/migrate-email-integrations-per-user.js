const { MongoClient } = require('mongodb');
require('dotenv').config();

async function migrate() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB);
  const col = db.collection('email_integrations');

  try {
    await col.dropIndex('tenant_id_1_provider_1');
    console.log('Dropped old index: tenant_id_1_provider_1');
  } catch (error) {
    console.log('Old index not found (already dropped or never existed):', error.message);
  }

  await col.createIndex({ user_id: 1, provider: 1 }, { unique: true });
  console.log('Created new index: user_id_1_provider_1 (unique)');

  await client.close();
  console.log('Migration complete');
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
