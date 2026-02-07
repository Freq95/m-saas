import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import * as fs from 'fs';
import { handleApiError, createErrorResponse } from '@/lib/error-handler';

// GET /api/clients/[id]/files/[fileId]/preview - Preview a file in browser
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const fileId = parseInt(params.fileId);
    const clientId = parseInt(params.id);

    let file = await db.collection('client_files').findOne({ id: fileId, client_id: clientId });
    if (!file) {
      file = await db.collection('contact_files').findOne({ id: fileId, contact_id: clientId });
    }

    if (!file) {
      return createErrorResponse('File not found', 404);
    }

    if (!fs.existsSync(file.file_path)) {
      return createErrorResponse('File not found on disk', 404);
    }

    const fileBuffer = fs.readFileSync(file.file_path);

    const mimeType = file.mime_type || 'application/octet-stream';
    const canPreview = mimeType.startsWith('image/') ||
      mimeType === 'application/pdf' ||
      mimeType.startsWith('text/') ||
      mimeType === 'application/json';

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
