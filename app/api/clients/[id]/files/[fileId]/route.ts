import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import * as fs from 'fs';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// PATCH /api/clients/[id]/files/[fileId] - Update file description
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const fileId = parseInt(params.fileId);
    const { DEFAULT_USER_ID } = await import('@/lib/constants');
    const userId = parseInt(request.nextUrl.searchParams.get('userId') || DEFAULT_USER_ID.toString(), 10);
    const body = await request.json();

    const { description } = body;

    let file = await db.collection('client_files').findOne({ id: fileId, user_id: userId });
    let collectionName = 'client_files';

    if (!file) {
      file = await db.collection('contact_files').findOne({ id: fileId, user_id: userId });
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
      { id: fileId, user_id: userId },
      { $set: { description: description || null, updated_at: now } }
    );
    if (result.matchedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const updated = await db.collection(collectionName).findOne({ id: fileId, user_id: userId });
    return createSuccessResponse({ file: updated ? stripMongoId(updated) : stripMongoId(file) });
  } catch (error) {
    return handleApiError(error, 'Failed to update file');
  }
}

// DELETE /api/clients/[id]/files/[fileId] - Delete a file
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const fileId = parseInt(params.fileId);
    const { DEFAULT_USER_ID } = await import('@/lib/constants');
    const userId = parseInt(request.nextUrl.searchParams.get('userId') || DEFAULT_USER_ID.toString(), 10);

    let file = await db.collection('client_files').findOne({ id: fileId, user_id: userId });
    let collectionName = 'client_files';

    if (!file) {
      file = await db.collection('contact_files').findOne({ id: fileId, user_id: userId });
      collectionName = 'contact_files';
    }

    if (!file) {
      return createErrorResponse('File not found', 404);
    }

    // Delete file from disk
    if (file.file_path && fs.existsSync(file.file_path)) {
      fs.unlinkSync(file.file_path);
    }

    const result = await db.collection(collectionName).deleteOne({ id: fileId, user_id: userId });
    if (result.deletedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }
    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete file');
  }
}
