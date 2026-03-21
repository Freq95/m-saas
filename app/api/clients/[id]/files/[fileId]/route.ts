import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { getStorageProvider } from '@/lib/storage';

// PATCH /api/clients/[id]/files/[fileId] - Update file description
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string; fileId: string }> }
) {
  const params = await props.params;
  try {
    const { tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);
    const fileId = parseInt(params.fileId);
    const body = await request.json();

    const { description } = body;

    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }
    if (isNaN(fileId) || fileId <= 0) {
      return createErrorResponse('Invalid file ID', 400);
    }

    let file = await db.collection('client_files').findOne({
      id: fileId,
      client_id: clientId,
      tenant_id: tenantId,
    });
    let collectionName = 'client_files';

    if (!file) {
      file = await db.collection('contact_files').findOne({
        id: fileId,
        contact_id: clientId,
        tenant_id: tenantId,
      });
      collectionName = 'contact_files';
    }

    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    const result = await db.collection(collectionName).updateOne(
      collectionName === 'client_files'
        ? { id: fileId, client_id: clientId, tenant_id: tenantId }
        : { id: fileId, contact_id: clientId, tenant_id: tenantId },
      { $set: { description: description || null, updated_at: now } }
    );
    if (result.matchedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const updated = await db.collection(collectionName).findOne(
      collectionName === 'client_files'
        ? { id: fileId, client_id: clientId, tenant_id: tenantId }
        : { id: fileId, contact_id: clientId, tenant_id: tenantId }
    );
    return createSuccessResponse({ file: updated ? stripMongoId(updated) : stripMongoId(file) });
  } catch (error) {
    return handleApiError(error, 'Failed to update file');
  }
}

// DELETE /api/clients/[id]/files/[fileId] - Delete a file
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string; fileId: string }> }
) {
  const params = await props.params;
  try {
    const { tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);
    const fileId = parseInt(params.fileId);

    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }
    if (isNaN(fileId) || fileId <= 0) {
      return createErrorResponse('Invalid file ID', 400);
    }

    let file = await db.collection('client_files').findOne({
      id: fileId,
      client_id: clientId,
      tenant_id: tenantId,
    });
    let collectionName = 'client_files';

    if (!file) {
      file = await db.collection('contact_files').findOne({
        id: fileId,
        contact_id: clientId,
        tenant_id: tenantId,
      });
      collectionName = 'contact_files';
    }

    if (!file) {
      return createErrorResponse('File not found', 404);
    }

    if (file.storage_key) {
      const storage = getStorageProvider();
      await storage.delete(String(file.storage_key));
    }

    const result = await db.collection(collectionName).deleteOne(
      collectionName === 'client_files'
        ? { id: fileId, client_id: clientId, tenant_id: tenantId }
        : { id: fileId, contact_id: clientId, tenant_id: tenantId }
    );
    if (result.deletedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }
    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete file');
  }
}
