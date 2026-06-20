import { ObjectId, type Db, type Document } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { eraseClientData, retryPendingErasureStorageCleanup } from '@/lib/server/gdpr-erasure';
import { logger } from '@/lib/logger';
import { MINIMUM_CLINICAL_RETENTION_YEARS } from '@/lib/retention';
import { getStorageProvider, isStorageConfigured } from '@/lib/storage';
import { evaluatePatientErasureEligibility } from '@/lib/server/patient-retention';

const DEFAULT_CLINICAL_YEARS = MINIMUM_CLINICAL_RETENTION_YEARS;
const DEFAULT_DELETE_GRACE_DAYS = 30;
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const DEFAULT_ORPHAN_SCAN_LIMIT = 250;

type RetentionOptions = {
  now?: Date;
  execute?: boolean;
  clinicalYears?: number;
  deleteGraceDays?: number;
  batchSize?: number;
  orphanCleanup?: boolean;
  orphanScanLimit?: number;
  db?: Db;
};

export type RetentionRunResult = {
  mode: 'dry-run' | 'execute';
  candidates: number;
  eligible: number;
  deleted: number;
  failed: number;
  skippedRecentActivity: number;
  orphanScanned: number;
  orphanCandidates: number;
  orphanDeleted: number;
  orphanFailed: number;
  clinicalCutoff: string;
  deleteGraceCutoff: string;
};

function clampInteger(value: number | undefined, fallback: number, minimum: number, maximum?: number) {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value!);
  const lowerBounded = Math.max(minimum, normalized);
  return maximum === undefined ? lowerBounded : Math.min(maximum, lowerBounded);
}

function subtractUtcYears(date: Date, years: number) {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() - years);
  return result;
}

function subtractUtcDays(date: Date, days: number) {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

async function storageKeyIsReferenced(db: Db, storageKey: string) {
  const references = await Promise.all([
    db.collection('client_files').findOne({ storage_key: storageKey }, { projection: { _id: 1 } }),
    db.collection('contact_files').findOne({ storage_key: storageKey }, { projection: { _id: 1 } }),
    db.collection('message_attachments').findOne({ storage_key: storageKey }, { projection: { _id: 1 } }),
    db.collection('clients').findOne({ consent_document_key: storageKey }, { projection: { _id: 1 } }),
    db.collection('treatment_plan_settings').findOne({ logo_storage_key: storageKey }, { projection: { _id: 1 } }),
    db.collection('treatment_plans').findOne({ logo_storage_key_snapshot: storageKey }, { projection: { _id: 1 } }),
  ]);
  return references.some(Boolean);
}

async function cleanupOrphanedStorage(
  db: Db,
  cutoff: Date,
  execute: boolean,
  scanLimit: number
) {
  const result = { scanned: 0, candidates: 0, deleted: 0, failed: 0 };
  if (!isStorageConfigured()) {
    result.failed = 1;
    logger.warn('Retention: orphan scan skipped because storage is not configured');
    return result;
  }
  const storage = getStorageProvider();
  if (!storage.list) {
    result.failed = 1;
    logger.warn('Retention: storage provider does not support orphan scanning');
    return result;
  }

  let continuationToken: string | undefined;
  while (result.scanned < scanLimit) {
    const page = await storage.list('tenants/', continuationToken, Math.min(100, scanLimit - result.scanned));
    if (page.objects.length === 0) break;
    for (const object of page.objects) {
      result.scanned++;
      if (!object.lastModified || object.lastModified > cutoff) continue;
      if (await storageKeyIsReferenced(db, object.key)) continue;
      result.candidates++;
      if (!execute) continue;
      try {
        await storage.delete(object.key);
        result.deleted++;
      } catch (error) {
        result.failed++;
        logger.error(
          'Retention: orphan storage deletion failed',
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
    if (!page.continuationToken) break;
    continuationToken = page.continuationToken;
  }
  return result;
}

export async function runDataRetention(options: RetentionOptions = {}): Promise<RetentionRunResult> {
  const db = options.db ?? await getMongoDbOrThrow();
  // These jobs belong to already-approved manual/retention erasures. Retrying
  // their private-object cleanup is safe even while new retention runs dry-run.
  try {
    await retryPendingErasureStorageCleanup(db);
  } catch (error) {
    logger.error('Retention: pending erasure storage cleanup failed', error instanceof Error ? error : new Error(String(error)));
  }
  const now = options.now ?? new Date();
  const clinicalYears = clampInteger(options.clinicalYears, DEFAULT_CLINICAL_YEARS, DEFAULT_CLINICAL_YEARS);
  const deleteGraceDays = clampInteger(options.deleteGraceDays, DEFAULT_DELETE_GRACE_DAYS, DEFAULT_DELETE_GRACE_DAYS);
  const batchSize = clampInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
  const orphanScanLimit = clampInteger(options.orphanScanLimit, DEFAULT_ORPHAN_SCAN_LIMIT, 1, 1000);
  const execute = options.execute === true;
  const clinicalCutoff = subtractUtcYears(now, clinicalYears);
  const deleteGraceCutoff = subtractUtcDays(now, deleteGraceDays);

  const previousRun = await db.collection('retention_runs').findOne(
    { next_candidate_after: { $exists: true } },
    { sort: { started_at: -1 }, projection: { next_candidate_after: 1 } }
  );
  const cursor = previousRun?.next_candidate_after;
  const baseFilter: Document = {
      deleted_at: { $type: 'string', $lte: deleteGraceCutoff.toISOString() },
      retention_legal_hold: { $ne: true },
  };
  const candidateFilter = cursor?.deleted_at && Number.isInteger(cursor?.id)
    ? {
        ...baseFilter,
        $or: [
          { deleted_at: { $gt: cursor.deleted_at, $lte: deleteGraceCutoff.toISOString() } },
          { deleted_at: cursor.deleted_at, id: { $gt: cursor.id } },
        ],
      }
    : baseFilter;
  let patients = await db.collection('clients')
    .find(candidateFilter)
    .sort({ deleted_at: 1, id: 1 })
    .limit(batchSize)
    .project({
      id: 1,
      tenant_id: 1,
      deleted_at: 1,
      created_at: 1,
      last_activity_date: 1,
      last_appointment_date: 1,
      last_conversation_date: 1,
    })
    .toArray();
  if (patients.length === 0 && cursor) {
    patients = await db.collection('clients')
      .find(baseFilter)
      .sort({ deleted_at: 1, id: 1 })
      .limit(batchSize)
      .project({
        id: 1, tenant_id: 1, deleted_at: 1, created_at: 1,
        last_activity_date: 1, last_appointment_date: 1, last_conversation_date: 1,
        retention_legal_hold: 1,
      })
      .toArray();
  }

  let eligible = 0;
  let deleted = 0;
  let failed = 0;
  let skippedRecentActivity = 0;

  for (const patient of patients) {
    if (!Number.isInteger(patient.id) || !patient.tenant_id) {
      failed++;
      continue;
    }
    const eligibility = await evaluatePatientErasureEligibility(db, patient, now, clinicalYears);
    if (!eligibility.eligible) {
      skippedRecentActivity++;
      continue;
    }
    eligible++;
    if (!execute) continue;

    try {
      const current = await db.collection('clients').findOne({
        id: patient.id,
        tenant_id: patient.tenant_id,
        retention_legal_hold: { $ne: true },
      });
      if (!current || !(await evaluatePatientErasureEligibility(db, current, new Date(), clinicalYears)).eligible) {
        skippedRecentActivity++;
        eligible--;
        continue;
      }
      const result = await eraseClientData({
        db,
        tenantId: patient.tenant_id,
        clientId: patient.id,
        erasedByUserId: null,
        reason: 'retention-policy',
      });
      if (result.recordsDeleted > 0) deleted++;
    } catch (error) {
      failed++;
      logger.error(
        'Retention: patient purge failed',
        error instanceof Error ? error : new Error(String(error)),
        { tenantId: String(patient.tenant_id) }
      );
    }
  }

  const orphanResult = options.orphanCleanup
    ? await cleanupOrphanedStorage(db, deleteGraceCutoff, execute, orphanScanLimit)
    : { scanned: 0, candidates: 0, deleted: 0, failed: 0 };

  const result: RetentionRunResult = {
    mode: execute ? 'execute' : 'dry-run',
    candidates: patients.length,
    eligible,
    deleted,
    failed,
    skippedRecentActivity,
    orphanScanned: orphanResult.scanned,
    orphanCandidates: orphanResult.candidates,
    orphanDeleted: orphanResult.deleted,
    orphanFailed: orphanResult.failed,
    clinicalCutoff: clinicalCutoff.toISOString(),
    deleteGraceCutoff: deleteGraceCutoff.toISOString(),
  };

  const expiresAt = new Date(now);
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
  await db.collection('retention_runs').insertOne({
    _id: new ObjectId(),
    ...result,
    started_at: now.toISOString(),
    expires_at_date: expiresAt,
    next_candidate_after: patients.length > 0
      ? { deleted_at: patients.at(-1)?.deleted_at, id: patients.at(-1)?.id }
      : null,
  });
  return result;
}

export function retentionOptionsFromEnv(): RetentionOptions {
  return {
    execute: process.env.GDPR_RETENTION_EXECUTE === 'true',
    clinicalYears: Number(process.env.GDPR_CLINICAL_RETENTION_YEARS || DEFAULT_CLINICAL_YEARS),
    deleteGraceDays: Number(process.env.GDPR_DELETE_GRACE_DAYS || DEFAULT_DELETE_GRACE_DAYS),
    batchSize: Number(process.env.GDPR_RETENTION_BATCH_SIZE || DEFAULT_BATCH_SIZE),
    orphanCleanup: process.env.GDPR_ORPHAN_CLEANUP_ENABLED === 'true',
    orphanScanLimit: Number(process.env.GDPR_ORPHAN_SCAN_LIMIT || DEFAULT_ORPHAN_SCAN_LIMIT),
  };
}
