import { randomUUID } from 'crypto';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from './db/mongo-utils';
import { getDateKeysForIntervalInTimeZone } from './timezone';

const LOCK_COLLECTION = 'appointment_write_locks';
const LOCK_TTL_MS = 15_000;
const LOCK_WAIT_TIMEOUT_MS = 4_000;
const LOCK_RETRY_DELAY_MS = 90;

let ensureIndexesPromise: Promise<void> | null = null;

interface AppointmentWriteLockDoc {
  _id: string;
  token: string;
  expires_at: Date;
  created_at: string;
}

export class AppointmentWriteBusyError extends Error {
  constructor(message: string = 'Another appointment is being written for the same time slot') {
    super(message);
    this.name = 'AppointmentWriteBusyError';
  }
}

interface AppointmentWriteLockScope {
  tenantId: ObjectId;
  userId: number;
  calendarId?: number;
  startTime: Date;
  endTime: Date;
  timeZone: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function ensureIndexes(): Promise<void> {
  if (!ensureIndexesPromise) {
    ensureIndexesPromise = (async () => {
      const db = await getMongoDbOrThrow();
      await db.collection(LOCK_COLLECTION).createIndex(
        { expires_at: 1 },
        {
          name: 'appointment_write_locks_ttl',
          expireAfterSeconds: 0,
        }
      );
    })().catch((error) => {
      ensureIndexesPromise = null;
      throw error;
    });
  }

  await ensureIndexesPromise;
}

function buildScopePrefix(scope: AppointmentWriteLockScope): string {
  const ownerScope = typeof scope.calendarId === 'number'
    ? `calendar:${scope.calendarId}`
    : `user:${scope.userId}`;
  return `${scope.tenantId.toString()}:${ownerScope}`;
}

function buildLockIds(scope: AppointmentWriteLockScope): string[] {
  const scopePrefix = buildScopePrefix(scope);
  const dateKeys = getDateKeysForIntervalInTimeZone(scope.startTime, scope.endTime, scope.timeZone);
  const lockIds = new Set<string>();

  for (const dateKey of dateKeys) {
    lockIds.add(`${scopePrefix}:base:${dateKey}`);
  }

  return Array.from(lockIds).sort();
}

async function releaseLocks(lockIds: string[], token: string): Promise<void> {
  if (lockIds.length === 0) {
    return;
  }

  const db = await getMongoDbOrThrow();
  await db.collection<AppointmentWriteLockDoc>(LOCK_COLLECTION).deleteMany({
    _id: { $in: lockIds },
    token,
  });
}

async function tryAcquireLocks(lockIds: string[], token: string): Promise<{ ok: boolean; acquired: string[] }> {
  const db = await getMongoDbOrThrow();
  const collection = db.collection<AppointmentWriteLockDoc>(LOCK_COLLECTION);
  const acquired: string[] = [];

  for (const lockId of lockIds) {
    const expiresAt = new Date(Date.now() + LOCK_TTL_MS);

    try {
      await collection.insertOne({
        _id: lockId,
        token,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      });
      acquired.push(lockId);
    } catch (error: any) {
      if (error?.code !== 11000) {
        throw error;
      }

      await collection.deleteOne({
        _id: lockId,
        expires_at: { $lte: new Date() },
      });

      return { ok: false, acquired };
    }
  }

  return { ok: true, acquired };
}

export async function withAppointmentWriteLocks<T>(
  scope: AppointmentWriteLockScope,
  task: () => Promise<T>
): Promise<T> {
  await ensureIndexes();

  const lockIds = buildLockIds(scope);
  const token = randomUUID();
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const { ok, acquired } = await tryAcquireLocks(lockIds, token);

    if (ok) {
      try {
        return await task();
      } finally {
        await releaseLocks(acquired, token);
      }
    }

    await releaseLocks(acquired, token);
    await sleep(LOCK_RETRY_DELAY_MS + Math.floor(Math.random() * 35));
  }

  throw new AppointmentWriteBusyError();
}
