import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { buildClientStorageKey, getStorageProvider } from '@/lib/storage';

// GET /api/clients/[id]/files - Get files for a client
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);

    // Validate ID
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    const client = await db.collection('clients').findOne({ id: clientId, user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } });
    if (!client) {
      return createErrorResponse('Client not found', 404);
    }

    let files = await db
      .collection('client_files')
      .find({ client_id: clientId, tenant_id: tenantId })
      .sort({ created_at: -1 })
      .toArray();

    if (files.length === 0) {
      files = await db
        .collection('contact_files')
        .find({ contact_id: clientId, tenant_id: tenantId })
        .sort({ created_at: -1 })
        .toArray();
    }

    return createSuccessResponse({ files: files.map(stripMongoId) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch files');
  }
}

// POST /api/clients/[id]/files - Upload a file for a client
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const description = formData.get('description') as string | null;

    // Validate ID
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    if (!file) {
      return createErrorResponse('No file provided', 400);
    }

    const client = await db.collection('clients').findOne({ id: clientId, user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } });
    if (!client) {
      return createErrorResponse('Client not found', 404);
    }

    // Validate file size
    const { MAX_FILE_SIZE, ALLOWED_FILE_TYPES } = await import('@/lib/constants');
    if (file.size > MAX_FILE_SIZE) {
      return createErrorResponse(`File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit`, 400);
    }

    // Validate file type (basic check)
    const isValidType = ALLOWED_FILE_TYPES.some(type => file.type.startsWith(type));
    if (!isValidType && file.type !== 'application/octet-stream') {
      return createErrorResponse('File type not allowed', 400);
    }

    const storage = getStorageProvider();
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const storageKey = buildClientStorageKey(String(tenantId), clientId, file.name);
    await storage.upload(storageKey, buffer, file.type || 'application/octet-stream');

    const now = new Date().toISOString();
    const fileId = await getNextNumericId('client_files');
    const fileDoc = {
      _id: fileId,
      id: fileId,
      tenant_id: tenantId,
      client_id: clientId,
      filename: storageKey.split('/').pop() || file.name,
      original_filename: file.name,
      storage_key: storageKey,
      file_size: file.size,
      mime_type: file.type,
      description: description || null,
      created_at: now,
      updated_at: now,
    };

    await db.collection('client_files').insertOne(fileDoc);

    // Update client's last_activity_date
    await db.collection('clients').updateOne(
      { id: clientId, tenant_id: tenantId },
      { $set: { last_activity_date: now, updated_at: now } }
    );
    return createSuccessResponse({ file: stripMongoId(fileDoc) }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to upload file');
  }
}
