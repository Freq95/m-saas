import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, type FlexDoc } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { getStorageProvider, isStorageConfigured } from '@/lib/storage';
import { logger } from '@/lib/logger';
import { checkUpdateRateLimit } from '@/lib/rate-limit';

// DELETE /api/clients/[id]/gdpr-erase - Permanently erase all client data (GDPR Art. 17)
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    const { userId, tenantId } = await getAuthUser();
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;

    // Parse body for confirmation
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return createErrorResponse('Invalid request body. Send { "confirm": true }', 400);
    }
    if (!body.confirm) {
      return createErrorResponse('Confirmation required. Send { "confirm": true }', 400);
    }

    // Verify client exists and belongs to this tenant
    const existing = await db.collection('clients').findOne({
      id: clientId,
      user_id: userId,
      tenant_id: tenantId,
    });
    if (!existing) {
      return createErrorResponse('Client not found', 404);
    }

    let recordCount = 0;
    let fileCount = 0;

    // Resolve every DB and storage dependency before deleting anything.
    const [clientFiles, contactFiles, conversations, appointments] = await Promise.all([
      db.collection('client_files').find({ client_id: clientId, tenant_id: tenantId }).toArray(),
      db.collection('contact_files').find({ contact_id: clientId, tenant_id: tenantId }).toArray(),
      db.collection('conversations').find({ client_id: clientId, tenant_id: tenantId }).toArray(),
      db.collection('appointments').find({ client_id: clientId, tenant_id: tenantId }).toArray(),
    ]);
    const convIds = conversations.map((c: any) => c.id);
    const appointmentIds = appointments.map((a: any) => a.id);
    const attachments = convIds.length > 0
      ? await db.collection('message_attachments')
          .find({ conversation_id: { $in: convIds }, tenant_id: tenantId })
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
        return createErrorResponse('Ștergerea nu poate continua deoarece stocarea fișierelor nu este configurată.', 503);
      }
      const storage = getStorageProvider();
      const results = await Promise.allSettled(
        [...storageKeys].map((storageKey) => storage.delete(storageKey))
      );
      const failedCount = results.filter((result) => result.status === 'rejected').length;
      if (failedCount > 0) {
        logger.warn('GDPR erase: storage cleanup failed; database records preserved', { failedCount });
        return createErrorResponse('Unele fișiere nu au putut fi șterse. Datele pacientului au fost păstrate.', 502);
      }
      fileCount = storageKeys.size;
    }

    // Cascade delete all related records after storage cleanup succeeds.
    // Messages in conversations
    if (convIds.length > 0) {
      const msgResult = await db.collection('messages').deleteMany({ conversation_id: { $in: convIds }, tenant_id: tenantId });
      recordCount += msgResult.deletedCount;

      // Message attachments DB records
      const attResult = await db.collection('message_attachments').deleteMany({ conversation_id: { $in: convIds }, tenant_id: tenantId });
      recordCount += attResult.deletedCount;

      // Conversation tags
      const tagResult = await db.collection('conversation_tags').deleteMany({ conversation_id: { $in: convIds }, tenant_id: tenantId });
      recordCount += tagResult.deletedCount;
    }

    // Conversations
    const convResult = await db.collection('conversations').deleteMany({ client_id: clientId, tenant_id: tenantId });
    recordCount += convResult.deletedCount;

    // Reminders linked to appointments
    if (appointmentIds.length > 0) {
      const remResult = await db.collection('reminders').deleteMany({ appointment_id: { $in: appointmentIds }, tenant_id: tenantId });
      recordCount += remResult.deletedCount;
    }

    // Appointments
    const apptResult = await db.collection('appointments').deleteMany({ client_id: clientId, tenant_id: tenantId });
    recordCount += apptResult.deletedCount;

    // Client files DB records
    const cfResult = await db.collection('client_files').deleteMany({ client_id: clientId, tenant_id: tenantId });
    recordCount += cfResult.deletedCount;

    // Legacy contact files DB records
    const legacyCfResult = await db.collection('contact_files').deleteMany({ contact_id: clientId, tenant_id: tenantId });
    recordCount += legacyCfResult.deletedCount;

    // Client notes
    const cnResult = await db.collection('client_notes').deleteMany({ client_id: clientId, tenant_id: tenantId });
    recordCount += cnResult.deletedCount;

    // Legacy contact notes
    const legacyCnResult = await db.collection('contact_notes').deleteMany({ contact_id: clientId, tenant_id: tenantId });
    recordCount += legacyCnResult.deletedCount;

    const customFieldsResult = await db.collection('contact_custom_fields').deleteMany({ contact_id: clientId, tenant_id: tenantId });
    recordCount += customFieldsResult.deletedCount;

    // Dental chart data (Phase 4 GDPR symmetry — exports include these, so
    // erasure must remove them. Hard-delete; the events soft-delete flag is
    // used for clinical edits only, not GDPR.)
    const toothStatesResult = await db.collection('tooth_states').deleteMany({ client_id: clientId, tenant_id: tenantId });
    recordCount += toothStatesResult.deletedCount;
    const toothEventsResult = await db.collection('tooth_events').deleteMany({ client_id: clientId, tenant_id: tenantId });
    recordCount += toothEventsResult.deletedCount;
    const surgeryGroupsResult = await db.collection('surgery_groups').deleteMany({ client_id: clientId, tenant_id: tenantId });
    recordCount += surgeryGroupsResult.deletedCount;
    const bridgeGroupsResult = await db.collection('bridge_groups').deleteMany({ client_id: clientId, tenant_id: tenantId });
    recordCount += bridgeGroupsResult.deletedCount;
    const treatmentPlansResult = await db.collection('treatment_plans').deleteMany({ client_id: clientId, tenant_id: tenantId });
    recordCount += treatmentPlansResult.deletedCount;

    const publicLinksResult = await db.collection('treatment_plan_public_links').deleteMany({ client_id: clientId, tenant_id: tenantId });
    recordCount += publicLinksResult.deletedCount;

    const accessLogsResult = await db.collection('data_access_logs').deleteMany({
      tenant_id: tenantId,
      target_id: clientId,
      target_type: { $regex: '^client(?:\\.|$)' },
    });
    recordCount += accessLogsResult.deletedCount;

    // Client record itself
    await db.collection('clients').deleteOne({ id: clientId, tenant_id: tenantId });
    recordCount += 1;

    // Create a non-identifying tombstone for accountability.
    const erasureId = await getNextNumericId('gdpr_erasures');
    await db.collection<FlexDoc>('gdpr_erasures').insertOne({
      _id: erasureId,
      id: erasureId,
      tenant_id: tenantId,
      erased_by_user_id: userId,
      erased_at: new Date().toISOString(),
      record_count: recordCount,
      file_count: fileCount,
    });

    // Invalidate caches only after the complete cascade succeeds.
    await invalidateReadCaches({ tenantId, userId });

    logger.info('GDPR erasure completed', { clientId, recordCount, fileCount });

    return createSuccessResponse({
      success: true,
      records_deleted: recordCount,
      files_deleted: fileCount,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to perform GDPR erasure');
  }
}
