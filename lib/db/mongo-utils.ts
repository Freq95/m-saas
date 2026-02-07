import { getMongoDb, invalidateMongoCache, stripMongoId } from './mongo';

export { invalidateMongoCache, stripMongoId };

export async function getMongoDbOrThrow(): Promise<any> {
  const db = await getMongoDb();
  if (!db) {
    throw new Error('MongoDB is not available. Ensure MONGODB_URI is set.');
  }
  return db;
}

export async function getNextNumericId(
  collectionName: string,
  idField: string = 'id'
): Promise<number> {
  const db = await getMongoDbOrThrow();
  const collection = db.collection(collectionName);
  const doc = await collection
    .find({ [idField]: { $type: 'number' } })
    .sort({ [idField]: -1 })
    .limit(1)
    .next();

  const maxId = doc?.[idField];
  if (typeof maxId === 'number') {
    return maxId + 1;
  }
  if (typeof doc?._id === 'number') {
    return (doc._id as number) + 1;
  }
  return 1;
}

export function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

export function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}
