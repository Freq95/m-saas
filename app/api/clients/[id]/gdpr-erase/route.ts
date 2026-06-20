import { NextRequest } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { logger } from '@/lib/logger';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { eraseClientData, ErasureStorageError } from '@/lib/server/gdpr-erasure';

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

    let result;
    try {
      result = await eraseClientData({
        db,
        tenantId,
        clientId,
        erasedByUserId: userId,
        reason: 'patient-request',
      });
    } catch (error) {
      if (error instanceof ErasureStorageError) {
        return createErrorResponse(error.message, error.status);
      }
      throw error;
    }

    // Invalidate caches only after the complete cascade succeeds.
    await invalidateReadCaches({ tenantId, userId });

    logger.info('GDPR erasure completed', {
      clientId,
      recordCount: result.recordsDeleted,
      fileCount: result.filesDeleted,
    });

    return createSuccessResponse({
      success: true,
      records_deleted: result.recordsDeleted,
      files_deleted: result.filesDeleted,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to perform GDPR erasure');
  }
}
