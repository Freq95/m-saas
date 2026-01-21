import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';

// GET /api/clients/[id]/files/[fileId]/download - Download a file
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const db = getDb();
    const fileId = parseInt(params.fileId);
    const contactId = parseInt(params.id);

    // Get file info
    const result = await db.query(
      `SELECT * FROM contact_files WHERE id = $1 AND contact_id = $2`,
      [fileId, contactId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const file = result.rows[0];

    // Check if file exists on disk
    if (!fs.existsSync(file.file_path)) {
      return NextResponse.json(
        { error: 'File not found on disk' },
        { status: 404 }
      );
    }

    // Read file
    const fileBuffer = fs.readFileSync(file.file_path);

    // Return file with appropriate headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${file.original_filename}"`,
        'Content-Length': file.file_size.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { error: 'Failed to download file', details: error.message },
      { status: 500 }
    );
  }
}

