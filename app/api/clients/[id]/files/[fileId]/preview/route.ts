import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as fs from 'fs';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';

// GET /api/clients/[id]/files/[fileId]/preview - Preview a file in browser
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const db = getDb();
    const fileId = parseInt(params.fileId);
    const clientId = parseInt(params.id);

    // Get file info - try client_files first, fallback to contact_files
    let result;
    try {
      result = await db.query(
        `SELECT * FROM client_files WHERE id = $1 AND client_id = $2`,
        [fileId, clientId]
      );
    } catch (e) {
      result = await db.query(
        `SELECT * FROM contact_files WHERE id = $1 AND contact_id = $2`,
        [fileId, clientId]
      );
    }

    if (result.rows.length === 0) {
      return createErrorResponse('File not found', 404);
    }

    const file = result.rows[0];

    // Check if file exists on disk
    if (!fs.existsSync(file.file_path)) {
      return createErrorResponse('File not found on disk', 404);
    }

    // Read file
    const fileBuffer = fs.readFileSync(file.file_path);

    // Determine if file can be previewed in browser
    const mimeType = file.mime_type || 'application/octet-stream';
    const canPreview = mimeType.startsWith('image/') || 
                       mimeType === 'application/pdf' ||
                       mimeType.startsWith('text/') ||
                       mimeType === 'application/json';

    // Return file with preview headers (inline instead of attachment)
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': canPreview 
          ? `inline; filename="${file.original_filename}"`
          : `attachment; filename="${file.original_filename}"`,
        'Content-Length': file.file_size.toString(),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to preview file');
  }
}

