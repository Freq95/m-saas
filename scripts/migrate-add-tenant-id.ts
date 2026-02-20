import 'dotenv/config';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '../lib/db/mongo-utils';

async function migrateTenantId() {
  const db = await getMongoDbOrThrow();

  let defaultTenant = await db.collection('tenants').findOne({});
  if (!defaultTenant) {
    const nowIso = new Date().toISOString();
    const result = await db.collection('tenants').insertOne({
      name: 'Default Clinic',
      slug: 'default-clinic',
      owner_id: null,
      plan: 'free',
      status: 'active',
      max_seats: 5,
      settings: {
        timezone: 'Europe/Bucharest',
        currency: 'RON',
      },
      created_at: nowIso,
      updated_at: nowIso,
    });
    defaultTenant = { _id: result.insertedId };
  }

  const tenantId = defaultTenant._id as ObjectId;
  const collections = [
    'appointments',
    'clients',
    'conversations',
    'messages',
    'services',
    'tasks',
    'reminders',
    'blocked_times',
    'waitlist',
    'email_integrations',
    'client_files',
    'client_notes',
    'contact_files',
    'contact_notes',
    'providers',
    'resources',
    'tags',
    'conversation_tags',
    'message_attachments',
    'audit_logs',
  ];

  for (const collName of collections) {
    const result = await db.collection(collName).updateMany(
      { tenant_id: { $exists: false } },
      { $set: { tenant_id: tenantId } }
    );
    console.log(`${collName}: updated ${result.modifiedCount}`);
  }

  const usersUpdated = await db.collection('users').updateMany(
    { tenant_id: { $exists: false }, role: { $ne: 'super_admin' } },
    { $set: { tenant_id: tenantId } }
  );
  console.log(`users: updated ${usersUpdated.modifiedCount}`);

  const membersUpdated = await db.collection('team_members').updateMany(
    { tenant_id: { $exists: false } },
    { $set: { tenant_id: tenantId } }
  );
  console.log(`team_members: updated ${membersUpdated.modifiedCount}`);
}

migrateTenantId()
  .then(() => {
    console.log('Tenant migration complete.');
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
