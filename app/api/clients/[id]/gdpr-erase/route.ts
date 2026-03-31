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

    // 1. Delete files from R2 + DB
    if (isStorageConfigured()) {
      const storage = getStorageProvider();

      // Client files
      const clientFiles = await db.collection('client_files')
        .find({ client_id: clientId, tenant_id: tenantId })
        .toArray();
      for (const file of clientFiles) {
        try {
          if (file.storage_key) await storage.delete(file.storage_key);
          fileCount++;
        } catch (err) {
          logger.warn('GDPR erase: failed to delete file from R2', { storageKey: file.storage_key });
        }
      }

      // Legacy contact files
      const contactFiles = await db.collection('contact_files')
        .find({ contact_id: clientId, tenant_id: tenantId })
        .toArray();
      for (const file of contactFiles) {
        try {
          if (file.storage_key) await storage.delete(file.storage_key);
          fileCount++;
        } catch (err) {
          logger.warn('GDPR erase: failed to delete legacy file from R2', { storageKey: file.storage_key });
        }
      }

      // Consent documents (stored in client record)
      if (existing.consent_document_key) {
        try {
          await storage.delete(existing.consent_document_key);
          fileCount++;
        } catch (err) {
          logger.warn('GDPR erase: failed to delete consent doc from R2');
        }
      }

      // Message attachments from conversations linked to this client
      const conversations = await db.collection('conversations')
        .find({ client_id: clientId, tenant_id: tenantId })
        .toArray();
      const convIds = conversations.map((c: any) => c.id);

      if (convIds.length > 0) {
        const attachments = await db.collection('message_attachments')
          .find({ conversation_id: { $in: convIds }, tenant_id: tenantId })
          .toArray();
        for (const att of attachments) {
          try {
            if (att.storage_key) await storage.delete(att.storage_key);
            fileCount++;
          } catch (err) {
            logger.warn('GDPR erase: failed to delete attachment from R2', { storageKey: att.storage_key });
          }
        }
      }
    }

    // 2. Get conversation IDs for cascade
    const conversations = await db.collection('conversations')
      .find({ client_id: clientId, tenant_id: tenantId })
      .toArray();
    const convIds = conversations.map((c: any) => c.id);

    // 3. Get appointment IDs for cascade
    const appointments = await db.collection('appointments')
      .find({ client_id: clientId, tenant_id: tenantId })
      .toArray();
    const appointmentIds = appointments.map((a: any) => a.id);

    // 4. Cascade delete all related records
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

    // Client record itself
    await db.collection('clients').deleteOne({ id: clientId, tenant_id: tenantId });
    recordCount += 1;

    // 5. Create tombstone audit record
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

    // 6. Invalidate caches
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
