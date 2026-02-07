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
const REPORT_FILE = path.join(process.cwd(), 'reports', 'mongo_validation_report.md');

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

function stripMongoId<T extends Record<string, unknown>>(doc: T): T {
  const { _id, ...rest } = doc;
  return rest as T;
}

function pickSamples<T>(items: T[]): T[] {
  if (items.length <= 3) return items;
  const mid = Math.floor(items.length / 2);
  return [items[0], items[mid], items[items.length - 1]];
}

async function validate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required to validate Mongo data.');
  }

  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`Data file not found: ${DATA_FILE}`);
  }

  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const data = JSON.parse(raw) as Record<string, unknown>;

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(getDbName(uri));

  const lines: string[] = [];
  const now = new Date().toISOString();
  lines.push(`# MongoDB Validation Report`);
  lines.push('');
  lines.push(`Generated: ${now}`);
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Collection | JSON Count | Mongo Count | Match |');
  lines.push('| --- | ---: | ---: | :---: |');

  const spotChecks: string[] = [];
  spotChecks.push('## Spot Checks');
  spotChecks.push('');

  try {
    for (const config of COLLECTIONS) {
      const items = (data[config.name] as Record<string, unknown>[]) || [];
      const jsonCount = Array.isArray(items) ? items.length : 0;
      const mongoCount = await db.collection<any>(config.name).countDocuments();
      const match = jsonCount === mongoCount ? '✅' : '⚠️';
      lines.push(`| ${config.name} | ${jsonCount} | ${mongoCount} | ${match} |`);

      const sampleItems = pickSamples(items);
      if (sampleItems.length === 0) {
        spotChecks.push(`- ${config.name}: no samples (empty)`);
        continue;
      }

      let okCount = 0;
      let failCount = 0;

      for (const sample of sampleItems) {
        const id = buildId(sample, config);
        const mongoDoc = await db.collection<any>(config.name).findOne({ _id: id } as any);
        if (!mongoDoc) {
          failCount += 1;
          continue;
        }

        const mongoClean = stripMongoId(mongoDoc);
        const jsonClean = sample;
        const same = stableStringify(mongoClean) === stableStringify(jsonClean);
        if (same) okCount += 1;
        else failCount += 1;
      }

      spotChecks.push(`- ${config.name}: ${okCount} ok, ${failCount} mismatch (sampled ${sampleItems.length})`);
    }
  } finally {
    await client.close();
  }

  lines.push('');
  lines.push(...spotChecks);
  lines.push('');

  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, lines.join('\n'), 'utf-8');
  console.log(`Validation report written to ${REPORT_FILE}`);
}

validate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('MongoDB validation failed:', error);
    process.exit(1);
  });
