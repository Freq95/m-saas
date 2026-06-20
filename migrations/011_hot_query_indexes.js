require('dotenv').config();
const { MongoClient } = require('mongodb');

const DEFAULT_DB_NAME = 'm-saas';

function getDbName(uri) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try {
    const url = new URL(uri);
    return url.pathname ? url.pathname.replace(/^\//, '') || DEFAULT_DB_NAME : DEFAULT_DB_NAME;
  } catch {
    return DEFAULT_DB_NAME;
  }
}

const indexes = [
  ['appointments', { tenant_id: 1, user_id: 1, deleted_at: 1, start_time: 1 }, 'appointments_scope_time'],
  ['appointments', { tenant_id: 1, calendar_id: 1, deleted_at: 1, start_time: 1 }, 'appointments_calendar_time'],
  ['appointments', { tenant_id: 1, user_id: 1, client_id: 1, deleted_at: 1, start_time: -1 }, 'appointments_client_owner_recent'],
  ['appointments', { service_owner_tenant_id: 1, service_owner_user_id: 1, client_id: 1, deleted_at: 1, start_time: -1 }, 'appointments_client_service_owner_recent'],
  ['clients', { tenant_id: 1, user_id: 1, deleted_at: 1, last_activity_date: -1 }, 'clients_scope_last_activity'],
  ['clients', { tenant_id: 1, user_id: 1, deleted_at: 1, total_spent: -1 }, 'clients_scope_total_spent'],
  ['clients', { tenant_id: 1, user_id: 1, deleted_at: 1, created_at: -1 }, 'clients_scope_created'],
  ['clients', { tenant_id: 1, user_id: 1, id: 1, deleted_at: 1 }, 'clients_scope_id'],
  ['conversations', { tenant_id: 1, user_id: 1, client_id: 1, updated_at: -1 }, 'conversations_client_recent'],
  ['tooth_states', { tenant_id: 1, user_id: 1, client_id: 1, tooth_fdi: 1 }, 'tooth_states_scope_client'],
  ['tooth_events', { tenant_id: 1, user_id: 1, client_id: 1, deleted_at: 1, occurred_at: -1, created_at: -1, tooth_fdi: 1 }, 'tooth_events_client_latest'],
  ['tooth_events', { tenant_id: 1, user_id: 1, client_id: 1, tooth_fdi: 1, deleted_at: 1, occurred_at: -1, created_at: -1 }, 'tooth_events_tooth_latest'],
  ['surgery_groups', { tenant_id: 1, user_id: 1, client_id: 1, created_at: -1 }, 'surgery_groups_scope_recent'],
  ['bridge_groups', { tenant_id: 1, user_id: 1, client_id: 1, created_at: -1 }, 'bridge_groups_scope_recent'],
  ['treatment_plans', { tenant_id: 1, user_id: 1, client_id: 1, deleted_at: 1, created_at: -1 }, 'treatment_plans_scope_recent'],
  ['treatment_plans', { tenant_id: 1, user_id: 1, client_id: 1, id: 1, deleted_at: 1 }, 'treatment_plans_scope_id'],
  ['client_files', { tenant_id: 1, client_id: 1, created_at: -1 }, 'client_files_client_recent'],
  ['client_files', { tenant_id: 1, client_id: 1, id: 1 }, 'client_files_client_id'],
  ['contact_files', { tenant_id: 1, contact_id: 1, created_at: -1 }, 'contact_files_contact_recent'],
  ['contact_files', { tenant_id: 1, contact_id: 1, id: 1 }, 'contact_files_contact_id'],
];

function sameKey(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function ensureIndex(db, collectionName, keys, name) {
  const collection = db.collection(collectionName);
  const existing = await collection.listIndexes().toArray();
  if (existing.some((index) => sameKey(index.key, keys))) return;
  await collection.createIndex(keys, { name });
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required to run MongoDB migrations.');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(getDbName(uri));
  try {
    for (const [collection, keys, name] of indexes) {
      await ensureIndex(db, collection, keys, name);
    }
    console.log('Hot query indexes created successfully.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Hot query index migration failed:', error);
  process.exit(1);
});
