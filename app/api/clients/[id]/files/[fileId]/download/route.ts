import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { getStorageProvider } from '@/lib/storage';

// GET /api/clients/[id]/files/[fileId]/download - Download a file
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const fileId = parseInt(params.fileId);
    const clientId = parseInt(params.id);

    const client = await db.collection('clients').findOne({ id: clientId, user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } });
    if (!client) {
      return createErrorResponse('Client not found', 404);
    }

    let file = await db.collection('client_files').findOne({ id: fileId, client_id: clientId, tenant_id: tenantId });
    if (!file) {
      file = await db.collection('contact_files').findOne({ id: fileId, contact_id: clientId, tenant_id: tenantId });
    }

    if (!file) {
      return createErrorResponse('File not found', 404);
    }

    if (file.storage_key) {
      const storage = getStorageProvider();
      const signedUrl = await storage.getSignedUrl(
        String(file.storage_key),
        3600,
        {
          contentDisposition: `attachment; filename="${file.original_filename}"`,
          contentType: file.mime_type || 'application/octet-stream',
        }
      );
      return NextResponse.redirect(signedUrl);
    }

    return createErrorResponse('File is not available in cloud storage. Run file migration and retry.', 410);
  } catch (error) {
    return handleApiError(error, 'Failed to download file');
  }
}
