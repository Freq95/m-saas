import { MongoClient, type Db } from 'mongodb';
import type { StorageData } from './sql-adapter';

const DEFAULT_DB_NAME = 'm-saas';
const COLLECTIONS: Array<keyof StorageData> = [
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

const CACHE_TTL_MS = Number(process.env.MONGO_CACHE_TTL_MS || 60_000);

let clientPromise: Promise<MongoClient> | null = null;
let cachedData: StorageData | null = null;
let cachedAt = 0;

function getDbName(uri: string): string {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try {
    const url = new URL(uri);
    const dbName = url.pathname?.replace(/^\//, '');
    if (dbName) return dbName;
  } catch {
    // ignore
  }
  return DEFAULT_DB_NAME;
}

async function getMongoClient(uri: string): Promise<MongoClient> {
  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  return clientPromise;
}

function createEmptyStorage(): StorageData {
  return {
    users: [],
    conversations: [],
    messages: [],
    tags: [],
    conversation_tags: [],
    services: [],
    appointments: [],
    reminders: [],
    google_calendar_sync: [],
    clients: [],
    tasks: [],
    client_files: [],
    client_notes: [],
    email_integrations: [],
    contact_files: [],
    contact_custom_fields: [],
    contact_notes: [],
  };
}

export function stripMongoId<T extends Record<string, unknown>>(doc: T): T {
  const { _id, ...rest } = doc;
  return rest as T;
}

export async function getMongoDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  const client = await getMongoClient(uri);
  return client.db(getDbName(uri));
}

export function invalidateMongoCache() {
  cachedData = null;
  cachedAt = 0;
}

export async function getMongoData(force = false): Promise<StorageData | null> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  const now = Date.now();
  if (!force && cachedData && now - cachedAt < CACHE_TTL_MS) {
    return cachedData;
  }

  try {
    const client = await getMongoClient(uri);
    const db = client.db(getDbName(uri));
    const data = createEmptyStorage();

    for (const name of COLLECTIONS) {
      try {
        const docs = await db.collection(name).find({}).toArray();
        data[name] = docs.map((doc) => stripMongoId(doc));
      } catch {
        data[name] = [];
      }
    }

    cachedData = data;
    cachedAt = now;
    return data;
  } catch {
    return null;
  }
}

export async function writeMongoCollection(
  name: keyof StorageData,
  docs: any[]
): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set');
  }

  const client = await getMongoClient(uri);
  const db = client.db(getDbName(uri));
  const collection = db.collection(name);

  await collection.deleteMany({});
  if (docs.length > 0) {
    const sanitized = docs.map((doc) => stripMongoId(doc));
    await collection.insertMany(sanitized, { ordered: false });
  }

  if (cachedData) {
    cachedData[name] = docs as any;
    cachedAt = Date.now();
  }
}
