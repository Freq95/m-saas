import { NextRequest } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { getStorageProvider, isStorageConfigured } from '@/lib/storage';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { checkWriteRateLimit } from '@/lib/rate-limit';

const MAX_CONSENT_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

// POST /api/clients/[id]/consent-document - Upload consent document
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId, tenantId } = await getAuthUser();
    const limited = await checkWriteRateLimit(userId);
    if (limited) return limited;

    if (!isStorageConfigured()) {
      return createErrorResponse('Storage not configured', 503);
    }

    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    const existing = await db.collection('clients').findOne({
      id: clientId,
      user_id: userId,
      tenant_id: tenantId,
      deleted_at: { $exists: false },
    });
    if (!existing) {
      return createErrorResponse('Client not found', 404);
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return createErrorResponse('No file provided', 400);
    }

    if (file.size > MAX_CONSENT_FILE_SIZE) {
      return createErrorResponse('File too large. Maximum 5MB.', 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return createErrorResponse('Invalid file type. Allowed: JPG, PNG, PDF.', 400);
    }

    const storage = getStorageProvider();
    const safeName = sanitizeFilename(file.name) || 'consent.pdf';
    const storageKey = `tenants/${String(tenantId)}/clients/${clientId}/consent/${Date.now()}_${safeName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await storage.upload(storageKey, buffer, file.type);

    // Delete old consent document if exists
    if (existing.consent_document_key) {
      try {
        await storage.delete(existing.consent_document_key);
      } catch { /* ignore cleanup failure */ }
    }

    // Update client with new consent document key
    await db.collection('clients').updateOne(
      { id: clientId, user_id: userId, tenant_id: tenantId },
      { $set: { consent_document_key: storageKey, updated_at: new Date().toISOString() } }
    );

    await invalidateReadCaches({ tenantId, userId });

    return createSuccessResponse({ storage_key: storageKey });
  } catch (error) {
    return handleApiError(error, 'Failed to upload consent document');
  }
}
