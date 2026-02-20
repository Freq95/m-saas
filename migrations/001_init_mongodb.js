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

const collections = [
  'tenants',
  'team_members',
  'invite_tokens',
  'users',
  'clients',
  'conversations',
  'messages',
  'audit_logs',
  'tags',
  'conversation_tags',
  'services',
  'appointments',
  'tasks',
  'providers',
  'resources',
  'blocked_times',
  'waitlist',
  'message_attachments',
  'client_notes',
  'client_files',
  'reminders',
  'email_integrations',
  'google_calendar_sync',
  'contact_files',
  'contact_custom_fields',
  'contact_notes',
];

const indexPlan = {
  tenants: [
    { key: { slug: 1 }, unique: true },
    { key: { status: 1 } },
  ],
  team_members: [
    { key: { tenant_id: 1, user_id: 1 }, unique: true },
    { key: { tenant_id: 1, status: 1 } },
    { key: { tenant_id: 1, email: 1 } },
  ],
  invite_tokens: [
    { key: { token: 1 }, unique: true },
    { key: { expires_at: 1 }, expireAfterSeconds: 0 },
    { key: { email: 1, used_at: 1 } },
  ],
  users: [{ key: { email: 1 } }, { key: { tenant_id: 1, role: 1 } }],
  clients: [
    { key: { tenant_id: 1, user_id: 1, last_activity_date: -1 } },
    { key: { tenant_id: 1, user_id: 1, last_appointment_date: -1 } },
    { key: { tenant_id: 1, user_id: 1, total_spent: -1 } },
    { key: { tenant_id: 1, user_id: 1, name: 1 } },
    { key: { tenant_id: 1, user_id: 1, email: 1 } },
    { key: { tenant_id: 1, user_id: 1, phone: 1 } },
  ],
  conversations: [
    { key: { tenant_id: 1, user_id: 1, created_at: -1 } },
    { key: { tenant_id: 1, user_id: 1, status: 1 } },
    { key: { tenant_id: 1, client_id: 1 } },
  ],
  messages: [
    { key: { tenant_id: 1, conversation_id: 1, sent_at: -1 } },
    { key: { tenant_id: 1, conversation_id: 1, created_at: -1 } },
  ],
  tags: [{ key: { tenant_id: 1, name: 1 } }],
  conversation_tags: [
    { key: { tenant_id: 1, conversation_id: 1 } },
    { key: { tenant_id: 1, tag_id: 1 } },
    { key: { tenant_id: 1, conversation_id: 1, tag_id: 1 }, unique: true },
  ],
  services: [{ key: { tenant_id: 1, user_id: 1 } }],
  appointments: [
    { key: { tenant_id: 1, user_id: 1, start_time: 1 } },
    { key: { tenant_id: 1, user_id: 1, status: 1 } },
    { key: { tenant_id: 1, client_id: 1 } },
  ],
  tasks: [
    { key: { tenant_id: 1, user_id: 1, status: 1 } },
    { key: { tenant_id: 1, contact_id: 1 } },
    { key: { tenant_id: 1, client_id: 1 } },
    { key: { tenant_id: 1, due_date: 1 } },
  ],
  providers: [
    { key: { tenant_id: 1, user_id: 1, is_active: 1 } },
  ],
  resources: [
    { key: { tenant_id: 1, user_id: 1, is_active: 1 } },
  ],
  blocked_times: [
    { key: { tenant_id: 1, user_id: 1, start_time: 1 } },
  ],
  waitlist: [
    { key: { tenant_id: 1, user_id: 1, created_at: -1 } },
  ],
  message_attachments: [
    { key: { tenant_id: 1, conversation_id: 1, message_id: 1 } },
  ],
  client_notes: [
    { key: { tenant_id: 1, client_id: 1, created_at: -1 } },
  ],
  client_files: [
    { key: { tenant_id: 1, client_id: 1, created_at: -1 } },
  ],
  reminders: [
    { key: { tenant_id: 1, user_id: 1 } },
    { key: { tenant_id: 1, appointment_id: 1 } },
  ],
  email_integrations: [
    { key: { tenant_id: 1, provider: 1 }, unique: true },
  ],
  google_calendar_sync: [
    { key: { tenant_id: 1, user_id: 1 } },
    { key: { tenant_id: 1, appointment_id: 1 } },
    { key: { tenant_id: 1, google_event_id: 1 } },
  ],
  contact_files: [{ key: { tenant_id: 1, contact_id: 1 } }],
  contact_custom_fields: [{ key: { tenant_id: 1, contact_id: 1 } }],
  contact_notes: [{ key: { tenant_id: 1, contact_id: 1 } }],
  audit_logs: [
    { key: { tenant_id: 1, created_at: -1 } },
    { key: { action: 1, created_at: -1 } },
    { key: { actor_user_id: 1, created_at: -1 } },
    { key: { target_type: 1, target_id: 1, created_at: -1 } },
  ],
};

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required to run MongoDB migrations.');
  }

  const dbName = getDbName(uri);
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  try {
    const existing = await db.listCollections({}, { nameOnly: true }).toArray();
    const existingNames = new Set(existing.map((c) => c.name));

    for (const name of collections) {
      if (!existingNames.has(name)) {
        await db.createCollection(name);
      }
    }

    for (const [collectionName, indexes] of Object.entries(indexPlan)) {
      if (!indexes || indexes.length === 0) continue;
      await db.collection(collectionName).createIndexes(indexes);
    }

    console.log('MongoDB migration (indexes + collections) completed.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('MongoDB migration failed:', error);
  process.exit(1);
});
