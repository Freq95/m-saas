import type { Db, ObjectId } from 'mongodb';
import { getMongoDbOrThrow, getNextNumericId, type FlexDoc } from '@/lib/db/mongo-utils';
import { getStorageProvider, isStorageConfigured } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { addUtcYears, MINIMUM_CLINICAL_RETENTION_YEARS } from '@/lib/retention';

export class ErasureStorageError extends Error {
  constructor(
    message: string,
    readonly status: 502 | 503
  ) {
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
};

export async function eraseClientData(options: EraseClientDataOptions): Promise<EraseClientDataResult> {
  const db = options.db ?? await getMongoDbOrThrow();
  const { tenantId, clientId, erasedByUserId, reason } = options;
  const existing = await db.collection('clients').findOne({ id: clientId, tenant_id: tenantId });
  if (!existing) return { recordsDeleted: 0, filesDeleted: 0 };

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
        .find({ conversation_id: { $in: conversationIds }, tenant_id: tenantId })
        .toArray()
    : [];

  const storageKeys = new Set<string>();
  for (const doc of [...clientFiles, ...contactFiles, ...attachments]) {
    if (typeof doc.storage_key === 'string' && doc.storage_key) storageKeys.add(doc.storage_key);
  }
  if (typeof existing.consent_document_key === 'string' && existing.consent_document_key) {
    storageKeys.add(existing.consent_document_key);
  }

  if (storageKeys.size > 0) {
    if (!isStorageConfigured()) {
      throw new ErasureStorageError(
        'Ștergerea nu poate continua deoarece stocarea fișierelor nu este configurată.',
        503
      );
    }
    const storage = getStorageProvider();
    const results = await Promise.allSettled(
      [...storageKeys].map((storageKey) => storage.delete(storageKey))
    );
    const failedCount = results.filter((result) => result.status === 'rejected').length;
    if (failedCount > 0) {
      logger.warn('GDPR erase: storage cleanup failed; database records preserved', { failedCount });
      throw new ErasureStorageError(
        'Unele fișiere nu au putut fi șterse. Datele pacientului au fost păstrate.',
        502
      );
    }
  }

  let recordsDeleted = 0;
  const count = (result: { deletedCount: number }) => {
    recordsDeleted += result.deletedCount;
  };

  if (conversationIds.length > 0) {
    count(await db.collection('messages').deleteMany({ conversation_id: { $in: conversationIds }, tenant_id: tenantId }));
    count(await db.collection('message_attachments').deleteMany({ conversation_id: { $in: conversationIds }, tenant_id: tenantId }));
    count(await db.collection('conversation_tags').deleteMany({ conversation_id: { $in: conversationIds }, tenant_id: tenantId }));
  }
  count(await db.collection('conversations').deleteMany({ client_id: clientId, tenant_id: tenantId }));

  if (appointmentIds.length > 0) {
    count(await db.collection('reminders').deleteMany({ appointment_id: { $in: appointmentIds }, tenant_id: tenantId }));
  }
  count(await db.collection('appointments').deleteMany({ client_id: clientId, tenant_id: tenantId }));
  count(await db.collection('client_files').deleteMany({ client_id: clientId, tenant_id: tenantId }));
  count(await db.collection('contact_files').deleteMany({ contact_id: clientId, tenant_id: tenantId }));
  count(await db.collection('client_notes').deleteMany({ client_id: clientId, tenant_id: tenantId }));
  count(await db.collection('contact_notes').deleteMany({ contact_id: clientId, tenant_id: tenantId }));
  count(await db.collection('contact_custom_fields').deleteMany({ contact_id: clientId, tenant_id: tenantId }));
  count(await db.collection('tooth_states').deleteMany({ client_id: clientId, tenant_id: tenantId }));
  count(await db.collection('tooth_events').deleteMany({ client_id: clientId, tenant_id: tenantId }));
  count(await db.collection('surgery_groups').deleteMany({ client_id: clientId, tenant_id: tenantId }));
  count(await db.collection('bridge_groups').deleteMany({ client_id: clientId, tenant_id: tenantId }));
  count(await db.collection('treatment_plans').deleteMany({ client_id: clientId, tenant_id: tenantId }));
  count(await db.collection('treatment_plan_public_links').deleteMany({ client_id: clientId, tenant_id: tenantId }));
  count(await db.collection('data_access_logs').deleteMany({
    tenant_id: tenantId,
    target_id: clientId,
    target_type: { $regex: '^client(?:\\.|$)' },
  }));
  count(await db.collection('clients').deleteOne({ id: clientId, tenant_id: tenantId }));

  const erasedAt = new Date();
  const erasureId = await getNextNumericId('gdpr_erasures');
  await db.collection<FlexDoc>('gdpr_erasures').insertOne({
    _id: erasureId,
    id: erasureId,
    tenant_id: tenantId,
    erased_by_user_id: erasedByUserId,
    reason,
    erased_at: erasedAt.toISOString(),
    expires_at_date: addUtcYears(erasedAt, MINIMUM_CLINICAL_RETENTION_YEARS),
    record_count: recordsDeleted,
    file_count: storageKeys.size,
  });

  return { recordsDeleted, filesDeleted: storageKeys.size };
}
