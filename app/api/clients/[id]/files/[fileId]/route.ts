import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, invalidateMongoCache, stripMongoId } from '@/lib/db/mongo-utils';
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
    const body = await request.json();

    const { description } = body;

    let file = await db.collection('client_files').findOne({ id: fileId });
    let collectionName = 'client_files';

    if (!file) {
      file = await db.collection('contact_files').findOne({ id: fileId });
      collectionName = 'contact_files';
    }

    if (!file) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    await db.collection(collectionName).updateOne(
      { id: fileId },
      { $set: { description: description || null, updated_at: now } }
    );

    const updated = await db.collection(collectionName).findOne({ id: fileId });
    invalidateMongoCache();
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

    let file = await db.collection('client_files').findOne({ id: fileId });
    let collectionName = 'client_files';

    if (!file) {
      file = await db.collection('contact_files').findOne({ id: fileId });
      collectionName = 'contact_files';
    }

    if (!file) {
      return createErrorResponse('File not found', 404);
    }

    // Delete file from disk
    if (file.file_path && fs.existsSync(file.file_path)) {
      fs.unlinkSync(file.file_path);
    }

    await db.collection(collectionName).deleteOne({ id: fileId });

    invalidateMongoCache();
    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete file');
  }
}
