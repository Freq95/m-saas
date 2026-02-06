import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as fs from 'fs';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// PATCH /api/clients/[id]/files/[fileId] - Update file description
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const db = getDb();
    const fileId = parseInt(params.fileId);
    const body = await request.json();

    const { description } = body;

    // Get file info - try client_files first, fallback to contact_files
    let result;
    try {
      result = await db.query(
        `SELECT * FROM client_files WHERE id = $1`,
        [fileId]
      );
    } catch (e) {
      result = await db.query(
        `SELECT * FROM contact_files WHERE id = $1`,
        [fileId]
      );
    }

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Update description - try client_files first
    let updateResult;
    try {
      updateResult = await db.query(
        `UPDATE client_files 
         SET description = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2
         RETURNING *`,
        [description || null, fileId]
      );
    } catch (e) {
      updateResult = await db.query(
        `UPDATE contact_files 
         SET description = $1, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $2
         RETURNING *`,
        [description || null, fileId]
      );
    }

    return createSuccessResponse({ file: updateResult.rows[0] });
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
    const db = getDb();
    const fileId = parseInt(params.fileId);

    // Get file info - try client_files first, fallback to contact_files
    let result;
    try {
      result = await db.query(
        `SELECT * FROM client_files WHERE id = $1`,
        [fileId]
      );
    } catch (e) {
      result = await db.query(
        `SELECT * FROM contact_files WHERE id = $1`,
        [fileId]
      );
    }

    if (result.rows.length === 0) {
      return createErrorResponse('File not found', 404);
    }

    const file = result.rows[0];

    // Delete file from disk
    if (fs.existsSync(file.file_path)) {
      fs.unlinkSync(file.file_path);
    }

    // Delete from database - try client_files first
    try {
      await db.query(
        `DELETE FROM client_files WHERE id = $1`,
        [fileId]
      );
    } catch (e) {
      await db.query(
        `DELETE FROM contact_files WHERE id = $1`,
        [fileId]
      );
    }

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete file');
  }
}

