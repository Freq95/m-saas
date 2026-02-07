import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MongoClient } from 'mongodb';

type CollectionConfig = {
  name: string;
  idField?: string;
  idFields?: string[];
  idMode?: 'field' | 'composite' | 'hash';
};

const DATA_FILE = path.join(process.cwd(), 'data', 'data.json');

const COLLECTIONS: CollectionConfig[] = [
  { name: 'users', idField: 'id', idMode: 'field' },
  { name: 'clients', idField: 'id', idMode: 'field' },
  { name: 'conversations', idField: 'id', idMode: 'field' },
  { name: 'messages', idField: 'id', idMode: 'field' },
  { name: 'tags', idField: 'id', idMode: 'field' },
  { name: 'conversation_tags', idFields: ['conversation_id', 'tag_id'], idMode: 'composite' },
  { name: 'services', idField: 'id', idMode: 'field' },
  { name: 'appointments', idField: 'id', idMode: 'field' },
  { name: 'tasks', idField: 'id', idMode: 'field' },
  // Note: client_notes and client_files have duplicate numeric ids in JSON.
  { name: 'client_notes', idMode: 'hash' },
  { name: 'client_files', idMode: 'hash' },
  { name: 'reminders', idField: 'id', idMode: 'field' },
  { name: 'email_integrations', idField: 'id', idMode: 'field' },
  { name: 'google_calendar_sync', idField: 'id', idMode: 'field' },
  { name: 'contact_files', idField: 'id', idMode: 'field' },
  { name: 'contact_custom_fields', idField: 'id', idMode: 'field' },
  { name: 'contact_notes', idField: 'id', idMode: 'field' },
];

const DEFAULT_DB_NAME = 'm-saas';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function hashObject(value: unknown): string {
  const hash = crypto.createHash('sha1');
  hash.update(stableStringify(value));
  return hash.digest('hex');
}

function buildId(doc: Record<string, unknown>, config: CollectionConfig): string | number {
  if (config.idMode === 'hash') {
    return hashObject(doc);
  }

  if (config.idMode === 'composite' && config.idFields && config.idFields.length > 0) {
    return config.idFields.map((field) => String(doc[field] ?? '')).join(':');
  }

  if (config.idField && doc[config.idField] !== undefined && doc[config.idField] !== null) {
    return doc[config.idField] as string | number;
  }

  if (config.idFields && config.idFields.length > 0) {
    return config.idFields.map((field) => String(doc[field] ?? '')).join(':');
  }

  return hashObject(doc);
}

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

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required to run the migration.');
  }

  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Data file not found: ${DATA_FILE}`);
  }

  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const data = JSON.parse(raw) as Record<string, unknown>;

  const dbName = getDbName(uri);
  const dryRun = process.env.MIGRATE_DRY_RUN === '1';
  const batchSize = Number(process.env.MIGRATE_BATCH_SIZE || 500);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  try {
    for (const config of COLLECTIONS) {
      const items = (data[config.name] as Record<string, unknown>[]) || [];
      if (!Array.isArray(items) || items.length === 0) {
        console.log(`[skip] ${config.name}: no records`);
        continue;
      }

      console.log(`[migrate] ${config.name}: ${items.length} records`);

      if (dryRun) {
        continue;
      }

      const collection = db.collection<any>(config.name);
      const operations = items.map((item) => {
        const doc = { ...item } as Record<string, unknown>;
        const id = buildId(doc, config);
        doc._id = id;
        return {
          replaceOne: {
            filter: { _id: id },
            replacement: doc,
            upsert: true,
          },
        };
      });

      for (let i = 0; i < operations.length; i += batchSize) {
        const batch = operations.slice(i, i + batchSize);
        await collection.bulkWrite(batch as any, { ordered: false });
      }
    }
  } finally {
    await client.close();
  }
}

migrate()
  .then(() => {
    console.log('MongoDB migration completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('MongoDB migration failed:', error);
    process.exit(1);
  });
