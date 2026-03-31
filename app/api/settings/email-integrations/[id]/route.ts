import { NextRequest } from 'next/server';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { deleteEmailIntegration, getEmailIntegrationById } from '@/lib/email-integrations';
import { integrationIdParamSchema } from '@/lib/validation';
import { getAuthUser } from '@/lib/auth-helpers';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { getStorageProvider } from '@/lib/storage';

// DELETE /api/settings/email-integrations/[id]
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId, tenantId, email: actorEmail } = await getAuthUser();
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;
    // Validate route parameter
    const paramValidation = integrationIdParamSchema.safeParse({ id: params.id });
    if (!paramValidation.success) {
      return createErrorResponse('Invalid integration ID', 400, JSON.stringify(paramValidation.error.errors));
    }
    
    const integrationId = paramValidation.data.id;
    const integration = await getEmailIntegrationById(integrationId, userId, tenantId);
    if (!integration) {
      return createErrorResponse('Integration not found', 404);
    }

    const deleted = await deleteEmailIntegration(integrationId, userId, tenantId);
    
    if (!deleted) {
      return createErrorResponse('Integration not found', 404);
    }

    let cleanedAttachmentRecords = 0;
    let cleanedStorageObjects = 0;
    try {
      const db = await getMongoDbOrThrow();
      const attachmentFilter = {
        user_id: userId,
        tenant_id: tenantId,
        source: integration.provider,
      };
      const attachments = await db
        .collection('message_attachments')
        .find(attachmentFilter)
        .project({ id: 1, storage_key: 1 })
        .toArray();

      if (attachments.length > 0) {
        try {
          const storage = getStorageProvider();
          for (const attachment of attachments) {
            if (!attachment?.storage_key || typeof attachment.storage_key !== 'string') {
              continue;
            }
            try {
              await storage.delete(attachment.storage_key);
              cleanedStorageObjects += 1;
            } catch (storageError) {
              logger.warn('Failed to delete message attachment from storage', {
                integrationId,
                attachmentId: attachment.id ?? null,
                error: storageError instanceof Error ? storageError.message : String(storageError),
              });
            }
          }
        } catch (storageProviderError) {
          logger.warn('Storage provider unavailable during integration cleanup', {
            integrationId,
            error:
              storageProviderError instanceof Error
                ? storageProviderError.message
                : String(storageProviderError),
          });
        }

        const deleteResult = await db.collection('message_attachments').deleteMany(attachmentFilter);
        cleanedAttachmentRecords = deleteResult.deletedCount ?? 0;
      }
    } catch (cleanupError) {
      logger.warn('Failed to cleanup message attachments after integration delete', {
        integrationId,
        userId,
        error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
      });
    }

    try {
      const db = await getMongoDbOrThrow();
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        request.headers.get('x-real-ip') ||
        null;
      const userAgent = request.headers.get('user-agent') || null;
      await db.collection('audit_logs').insertOne({
        action: 'email_integration.deleted',
        actor_user_id: String(userId),
        actor_email: actorEmail || null,
        target_type: 'email_integration',
        target_id: String(integrationId),
        tenant_id: tenantId,
        ip,
        user_agent: userAgent,
        metadata: {
          provider: integration.provider,
          email: integration.email,
          cleanedAttachmentRecords,
          cleanedStorageObjects,
        },
        created_at: new Date().toISOString(),
      });
    } catch (auditError) {
      logger.warn('Failed to write email integration delete audit log', {
        userId,
        integrationId,
        error: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }
    
    return createSuccessResponse({ message: 'Integration deleted' });
  } catch (error) {
    return handleApiError(error, 'Failed to delete integration');
  }
}

