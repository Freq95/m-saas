import 'dotenv/config';
import { getMongoDbOrThrow } from '../lib/db/mongo-utils';

async function createTenantIndexes() {
  const db = await getMongoDbOrThrow();

  await db.collection('appointments').createIndex({ tenant_id: 1, start_time: -1 });
  await db.collection('appointments').createIndex({ tenant_id: 1, client_id: 1 });
  await db.collection('appointments').createIndex({ tenant_id: 1, provider_id: 1, start_time: 1 });
  await db.collection('appointments').createIndex({ tenant_id: 1, status: 1 });

  await db.collection('clients').createIndex({ tenant_id: 1, status: 1 });
  await db.collection('clients').createIndex({ tenant_id: 1, email: 1 });
  await db.collection('clients').createIndex({ tenant_id: 1, name: 1 });
  await db.collection('clients').createIndex({ tenant_id: 1, created_at: -1 });

  await db.collection('conversations').createIndex({ tenant_id: 1, updated_at: -1 });
  await db.collection('conversations').createIndex({ tenant_id: 1, channel: 1 });

  await db.collection('messages').createIndex({ tenant_id: 1, conversation_id: 1, created_at: -1 });

  await db.collection('services').createIndex({ tenant_id: 1, is_active: 1 });
  await db.collection('tasks').createIndex({ tenant_id: 1, status: 1, due_date: 1 });
  await db.collection('reminders').createIndex({ tenant_id: 1, status: 1, scheduled_at: 1 });

  await db.collection('email_integrations').createIndex(
    { tenant_id: 1, provider: 1 },
    { unique: true }
  );
  // Cleanup legacy pre-tenancy unique index if present.
  try {
    await db.collection('email_integrations').dropIndex('user_id_1_provider_1');
  } catch {
    // ignore if already removed
  }

  await db.collection('client_files').createIndex({ tenant_id: 1, client_id: 1 });
  await db.collection('providers').createIndex({ tenant_id: 1, is_active: 1 });
  await db.collection('resources').createIndex({ tenant_id: 1, type: 1, is_active: 1 });
  await db.collection('blocked_times').createIndex({ tenant_id: 1, start_time: 1 });

  console.log('Tenant indexes created.');
}

createTenantIndexes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
