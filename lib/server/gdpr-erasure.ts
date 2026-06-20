import { ObjectId, type ClientSession, type Db } from 'mongodb';
import { getMongoDbOrThrow, getNextNumericId, type FlexDoc } from '@/lib/db/mongo-utils';
import { getStorageProvider, isStorageConfigured } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { addUtcYears, MINIMUM_CLINICAL_RETENTION_YEARS } from '@/lib/retention';

export class ErasureStorageError extends Error {
  constructor(message: string, readonly status: 502 | 503) {
    super(message);
    this.name = 'ErasureStorageError';
  }
}

type EraseClientDataOptions = {
  tenantId: ObjectId;
  clientId: number;
  erasedByUserId: number | null;
  reason: 'patient-request' | 'retention-policy';
  db?: Db;
};

export type EraseClientDataResult = {
  recordsDeleted: number;
  filesDeleted: number;
  filesPending: number;
};

function sessionOptions(session?: ClientSession) {
  return session ? { session } : undefined;
}

async function runTransaction<T>(db: Db, callback: (session?: ClientSession) => Promise<T>): Promise<T> {
  if (!db.client?.startSession) return callback();
  const session = db.client.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => { result = await callback(session); });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function retryPendingErasureStorageCleanup(db: Db, limit = 25) {
  if (!isStorageConfigured()) return { attempted: 0, completed: 0, failed: 0 };
  const jobs = await db.collection('erasure_storage_cleanup_jobs')
    .find({ status: 'pending' }).sort({ created_at: 1 }).limit(limit).toArray();
  const storage = getStorageProvider();
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    const keys = Array.isArray(job.storage_keys)
      ? job.storage_keys.filter((key): key is string => typeof key === 'string')
      : [];
    const results = await Promise.allSettled(keys.map((key) => storage.delete(key)));
    const remaining = keys.filter((_key, index) => results[index]?.status === 'rejected');
    if (remaining.length === 0) {
      await db.collection('erasure_storage_cleanup_jobs').deleteOne({ _id: job._id });
      completed++;
    } else {
      await db.collection('erasure_storage_cleanup_jobs').updateOne(
        { _id: job._id },
        { $set: { storage_keys: remaining, updated_at: new Date().toISOString() }, $inc: { attempts: 1 } }
      );
      failed++;
    }
  }
  return { attempted: jobs.length, completed, failed };
}

export async function eraseClientData(options: EraseClientDataOptions): Promise<EraseClientDataResult> {
  const db = options.db ?? await getMongoDbOrThrow();
  const { tenantId, clientId, erasedByUserId, reason } = options;
  const existing = await db.collection('clients').findOne({ id: clientId, tenant_id: tenantId });
  if (!existing) return { recordsDeleted: 0, filesDeleted: 0, filesPending: 0 };

  const [clientFiles, contactFiles, conversations, appointments] = await Promise.all([
    db.collection('client_files').find({ client_id: clientId, tenant_id: tenantId }).toArray(),
    db.collection('contact_files').find({ contact_id: clientId, tenant_id: tenantId }).toArray(),
    db.collection('conversations').find({ client_id: clientId, tenant_id: tenantId }).toArray(),
    db.collection('appointments').find({ client_id: clientId, tenant_id: tenantId }).toArray(),
  ]);
  const conversationIds = conversations.map((conversation) => conversation.id);
  const appointmentIds = appointments.map((appointment) => appointment.id);
  const attachments = conversationIds.length > 0
    ? await db.collection('message_attachments')
        .find({ conversation_id: { $in: conversationIds }, tenant_id: tenantId }).toArray()
    : [];

  const storageKeys = new Set<string>();
  for (const doc of [...clientFiles, ...contactFiles, ...attachments]) {
    if (typeof doc.storage_key === 'string' && doc.storage_key) storageKeys.add(doc.storage_key);
  }
  if (typeof existing.consent_document_key === 'string' && existing.consent_document_key) {
    storageKeys.add(existing.consent_document_key);
  }
  if (storageKeys.size > 0 && !isStorageConfigured()) {
    throw new ErasureStorageError(
      'Ștergerea nu poate continua deoarece stocarea fișierelor nu este configurată.', 503
    );
  }

  const erasedAt = new Date();
  const erasureId = await getNextNumericId('gdpr_erasures');
  const cleanupJobId = new ObjectId();
  const recordsDeleted = await runTransaction(db, async (session) => {
    let total = 0;
    const count = (result: { deletedCount: number }) => { total += result.deletedCount; };
    const opts = sessionOptions(session);
    if (storageKeys.size > 0) {
      await db.collection('erasure_storage_cleanup_jobs').insertOne({
        _id: cleanupJobId,
        tenant_id: tenantId,
        owner_user_id: existing.user_id,
        storage_keys: [...storageKeys],
        status: 'pending',
        attempts: 0,
        created_at: erasedAt.toISOString(),
        updated_at: erasedAt.toISOString(),
      }, opts);
    }
    if (conversationIds.length > 0) {
      count(await db.collection('messages').deleteMany({ conversation_id: { $in: conversationIds }, tenant_id: tenantId }, opts));
      count(await db.collection('message_attachments').deleteMany({ conversation_id: { $in: conversationIds }, tenant_id: tenantId }, opts));
      count(await db.collection('conversation_tags').deleteMany({ conversation_id: { $in: conversationIds }, tenant_id: tenantId }, opts));
    }
    count(await db.collection('conversations').deleteMany({ client_id: clientId, tenant_id: tenantId }, opts));
    if (appointmentIds.length > 0) {
      count(await db.collection('reminders').deleteMany({ appointment_id: { $in: appointmentIds }, tenant_id: tenantId }, opts));
    }
    for (const [name, filter] of [
      ['appointments', { client_id: clientId, tenant_id: tenantId }],
      ['client_files', { client_id: clientId, tenant_id: tenantId }],
      ['contact_files', { contact_id: clientId, tenant_id: tenantId }],
      ['client_notes', { client_id: clientId, tenant_id: tenantId }],
      ['contact_notes', { contact_id: clientId, tenant_id: tenantId }],
      ['contact_custom_fields', { contact_id: clientId, tenant_id: tenantId }],
      ['tooth_states', { client_id: clientId, tenant_id: tenantId }],
      ['tooth_events', { client_id: clientId, tenant_id: tenantId }],
      ['surgery_groups', { client_id: clientId, tenant_id: tenantId }],
      ['bridge_groups', { client_id: clientId, tenant_id: tenantId }],
      ['treatment_plans', { client_id: clientId, tenant_id: tenantId }],
      ['treatment_plan_public_links', { client_id: clientId, tenant_id: tenantId }],
    ] as const) {
      count(await db.collection(name).deleteMany(filter, opts));
    }
    count(await db.collection('data_access_logs').deleteMany({
      tenant_id: tenantId,
      $or: [
        { target_id: clientId, target_type: { $regex: '^client(?:\\.|$)' } },
        { route: { $regex: `/clients/${clientId}(?:/|$)` } },
      ],
    }, opts));
    count(await db.collection('clients').deleteOne({ id: clientId, tenant_id: tenantId }, opts));
    await db.collection<FlexDoc>('gdpr_erasures').insertOne({
      _id: erasureId,
      id: erasureId,
      tenant_id: tenantId,
      erased_by_user_id: erasedByUserId,
      reason,
      erased_at: erasedAt.toISOString(),
      expires_at_date: addUtcYears(erasedAt, MINIMUM_CLINICAL_RETENTION_YEARS),
      record_count: total,
      file_count: storageKeys.size,
    }, opts);
    return total;
  });

  if (storageKeys.size === 0) return { recordsDeleted, filesDeleted: 0, filesPending: 0 };
  const keys = [...storageKeys];
  const results = await Promise.allSettled(keys.map((key) => getStorageProvider().delete(key)));
  const remaining = keys.filter((_key, index) => results[index]?.status === 'rejected');
  if (remaining.length === 0) {
    await db.collection('erasure_storage_cleanup_jobs').deleteOne({ _id: cleanupJobId });
  } else {
    logger.warn('GDPR erase: private storage cleanup queued for retry', { failedCount: remaining.length });
    await db.collection('erasure_storage_cleanup_jobs').updateOne(
      { _id: cleanupJobId },
      { $set: { storage_keys: remaining, updated_at: new Date().toISOString() }, $inc: { attempts: 1 } }
    );
  }
  return {
    recordsDeleted,
    filesDeleted: keys.length - remaining.length,
    filesPending: remaining.length,
  };
}
