import { ObjectId, type Db, type Document } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { eraseClientData } from '@/lib/server/gdpr-erasure';
import { logger } from '@/lib/logger';
import { MINIMUM_CLINICAL_RETENTION_YEARS } from '@/lib/retention';
import { getStorageProvider, isStorageConfigured } from '@/lib/storage';

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

function latestIso(values: unknown[]) {
  const valid = values
    .filter((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
    .sort();
  return valid.at(-1) ?? null;
}

async function latestField(
  db: Db,
  collectionName: string,
  filter: Document,
  field: string
) {
  const doc = await db.collection(collectionName).findOne(filter, {
    projection: { [field]: 1 },
    sort: { [field]: -1 },
  });
  return doc?.[field];
}

async function getLastPatientContact(db: Db, patient: Document) {
  const scope = { tenant_id: patient.tenant_id, client_id: patient.id };
  const legacyScope = { tenant_id: patient.tenant_id, contact_id: patient.id };
  const latest = await Promise.all([
    latestField(db, 'appointments', scope, 'start_time'),
    latestField(db, 'conversations', scope, 'updated_at'),
    latestField(db, 'client_notes', scope, 'created_at'),
    latestField(db, 'contact_notes', legacyScope, 'created_at'),
    latestField(db, 'client_files', scope, 'created_at'),
    latestField(db, 'contact_files', legacyScope, 'created_at'),
    latestField(db, 'tooth_events', scope, 'occurred_at'),
    latestField(db, 'surgery_groups', scope, 'created_at'),
    latestField(db, 'bridge_groups', scope, 'created_at'),
    latestField(db, 'treatment_plans', scope, 'updated_at'),
  ]);
  return latestIso([
    patient.last_activity_date,
    patient.last_appointment_date,
    patient.last_conversation_date,
    patient.created_at,
    ...latest,
  ]);
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
  const now = options.now ?? new Date();
  const clinicalYears = clampInteger(options.clinicalYears, DEFAULT_CLINICAL_YEARS, DEFAULT_CLINICAL_YEARS);
  const deleteGraceDays = clampInteger(options.deleteGraceDays, DEFAULT_DELETE_GRACE_DAYS, DEFAULT_DELETE_GRACE_DAYS);
  const batchSize = clampInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, MAX_BATCH_SIZE);
  const orphanScanLimit = clampInteger(options.orphanScanLimit, DEFAULT_ORPHAN_SCAN_LIMIT, 1, 1000);
  const execute = options.execute === true;
  const clinicalCutoff = subtractUtcYears(now, clinicalYears);
  const deleteGraceCutoff = subtractUtcDays(now, deleteGraceDays);

  const patients = await db.collection('clients')
    .find({
      deleted_at: { $type: 'string', $lte: deleteGraceCutoff.toISOString() },
      retention_legal_hold: { $ne: true },
    })
    .sort({ deleted_at: 1 })
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

  let eligible = 0;
  let deleted = 0;
  let failed = 0;
  let skippedRecentActivity = 0;

  for (const patient of patients) {
    if (!Number.isInteger(patient.id) || !patient.tenant_id) {
      failed++;
      continue;
    }
    const lastContact = await getLastPatientContact(db, patient);
    if (!lastContact || lastContact > clinicalCutoff.toISOString()) {
      skippedRecentActivity++;
      continue;
    }
    eligible++;
    if (!execute) continue;

    try {
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
