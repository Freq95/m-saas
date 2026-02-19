import { getMongoDb, stripMongoId } from './mongo';

export { stripMongoId };

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
  const counters = db.collection('counters');

  const doc = await collection
    .find({ [idField]: { $type: 'number' } })
    .sort({ [idField]: -1 })
    .limit(1)
    .next();

  const maxId = doc?.[idField];
  const currentMax =
    typeof maxId === 'number'
      ? maxId
      : typeof doc?._id === 'number'
        ? (doc._id as number)
        : 0;

  const counterKey = `${collectionName}:${idField}`;
  const nowIso = new Date().toISOString();

  // Ensure counter doc exists without conflicting updates on the same path.
  await counters.updateOne(
    { _id: counterKey },
    {
      $setOnInsert: {
        seq: currentMax,
        created_at: nowIso,
      },
    },
    { upsert: true }
  );

  // Ensure counter is not behind current collection max (safety for legacy data/imports).
  await counters.updateOne(
    { _id: counterKey },
    {
      $max: { seq: currentMax },
      $set: { updated_at: nowIso },
    }
  );

  const result: any = await counters.findOneAndUpdate(
    { _id: counterKey },
    {
      $inc: { seq: 1 },
      $set: { updated_at: new Date().toISOString() },
    },
    {
      upsert: true,
      returnDocument: 'after',
    }
  );

  const value = result?.value ?? result;
  if (typeof value?.seq === 'number') {
    return value.seq;
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
