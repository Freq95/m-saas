import { MongoClient, type Db } from 'mongodb';

const DEFAULT_DB_NAME = 'm-saas';

let clientPromise: Promise<MongoClient> | null = null;

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
