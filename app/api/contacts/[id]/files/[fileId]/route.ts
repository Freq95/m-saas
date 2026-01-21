import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as fs from 'fs';

// DELETE /api/contacts/[id]/files/[fileId] - Delete a file
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const db = getDb();
    const fileId = parseInt(params.fileId);

    // Get file info
    const result = await db.query(
      `SELECT * FROM contact_files WHERE id = $1`,
      [fileId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const file = result.rows[0];

    // Delete file from disk
    if (fs.existsSync(file.file_path)) {
      fs.unlinkSync(file.file_path);
    }

    // Delete from database
    await db.query(
      `DELETE FROM contact_files WHERE id = $1`,
      [fileId]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { error: 'Failed to delete file', details: error.message },
      { status: 500 }
    );
  }
}

