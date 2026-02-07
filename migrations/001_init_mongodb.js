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
  'users',
  'clients',
  'conversations',
  'messages',
  'tags',
  'conversation_tags',
  'services',
  'appointments',
  'tasks',
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
  users: [{ key: { email: 1 } }],
  clients: [
    { key: { user_id: 1, last_activity_date: -1 } },
    { key: { user_id: 1, last_appointment_date: -1 } },
    { key: { user_id: 1, total_spent: -1 } },
    { key: { user_id: 1, name: 1 } },
    { key: { user_id: 1, email: 1 } },
    { key: { user_id: 1, phone: 1 } },
  ],
  conversations: [
    { key: { user_id: 1, created_at: -1 } },
    { key: { user_id: 1, status: 1 } },
    { key: { client_id: 1 } },
  ],
  messages: [
    { key: { conversation_id: 1, sent_at: -1 } },
    { key: { conversation_id: 1, created_at: -1 } },
  ],
  tags: [{ key: { name: 1 } }],
  conversation_tags: [
    { key: { conversation_id: 1 } },
    { key: { tag_id: 1 } },
    { key: { conversation_id: 1, tag_id: 1 }, unique: true },
  ],
  services: [{ key: { user_id: 1 } }],
  appointments: [
    { key: { user_id: 1, start_time: 1 } },
    { key: { user_id: 1, status: 1 } },
    { key: { client_id: 1 } },
  ],
  tasks: [
    { key: { user_id: 1, status: 1 } },
    { key: { contact_id: 1 } },
    { key: { client_id: 1 } },
    { key: { due_date: 1 } },
  ],
  client_notes: [
    { key: { client_id: 1, created_at: -1 } },
  ],
  client_files: [
    { key: { client_id: 1, created_at: -1 } },
  ],
  reminders: [
    { key: { user_id: 1 } },
    { key: { appointment_id: 1 } },
  ],
  email_integrations: [
    { key: { user_id: 1, provider: 1 }, unique: true },
  ],
  google_calendar_sync: [
    { key: { user_id: 1 } },
    { key: { appointment_id: 1 } },
    { key: { google_event_id: 1 } },
  ],
  contact_files: [{ key: { contact_id: 1 } }],
  contact_custom_fields: [{ key: { contact_id: 1 } }],
  contact_notes: [{ key: { contact_id: 1 } }],
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
