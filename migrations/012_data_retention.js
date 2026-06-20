require('dotenv').config();
const { MongoClient } = require('mongodb');

const DEFAULT_DB_NAME = 'm-saas';
const RETENTION_YEARS = 5;

function getDbName(uri) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try {
    return new URL(uri).pathname.replace(/^\//, '') || DEFAULT_DB_NAME;
  } catch {
    return DEFAULT_DB_NAME;
  }
}

function expiryPipeline(sourceField, years) {
  return [{
    $set: {
      expires_at_date: {
        $dateAdd: {
          startDate: {
            $convert: {
              input: `$${sourceField}`,
              to: 'date',
              onError: '$$NOW',
              onNull: '$$NOW',
            },
          },
          unit: 'year',
          amount: years,
        },
      },
    },
  }];
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required to run MongoDB migrations.');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(getDbName(uri));

  try {
    await db.collection('data_access_logs').updateMany(
      { expires_at_date: { $exists: false } },
      expiryPipeline('created_at', RETENTION_YEARS)
    );
    await db.collection('gdpr_erasures').updateMany(
      { expires_at_date: { $exists: false } },
      expiryPipeline('erased_at', RETENTION_YEARS)
    );

    await db.collection('data_access_logs').createIndex(
      { expires_at_date: 1 },
      { expireAfterSeconds: 0, name: 'data_access_logs_retention_ttl' }
    );
    await db.collection('gdpr_erasures').createIndex(
      { expires_at_date: 1 },
      { expireAfterSeconds: 0, name: 'gdpr_erasures_retention_ttl' }
    );
    await db.collection('retention_runs').createIndex(
      { expires_at_date: 1 },
      { expireAfterSeconds: 0, name: 'retention_runs_ttl' }
    );
    await db.collection('clients').createIndex(
      { deleted_at: 1, retention_legal_hold: 1 },
      { name: 'clients_retention_candidates' }
    );

    console.log('Data retention fields and indexes created successfully.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Data retention migration failed:', error);
  process.exit(1);
});
