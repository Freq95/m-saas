import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'clients');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// GET /api/clients/[id]/files - Get files for a client
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const clientId = parseInt(params.id);

    // Validate ID
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    // Try client_files first, fallback to contact_files for migration
    let result;
    try {
      result = await db.query(
        `SELECT * FROM client_files WHERE client_id = $1 ORDER BY created_at DESC`,
        [clientId]
      );
    } catch (e) {
      // Fallback to legacy contact_files
      result = await db.query(
        `SELECT * FROM contact_files WHERE contact_id = $1 ORDER BY created_at DESC`,
        [clientId]
      );
    }

    return createSuccessResponse({ files: result.rows || [] });
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
    const db = getDb();
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

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${clientId}_${timestamp}_${sanitizedName}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    fs.writeFileSync(filepath, buffer);

    // Save file metadata to database
    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO client_files (client_id, filename, original_filename, file_path, file_size, mime_type, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        clientId,
        filename,
        file.name,
        filepath,
        file.size,
        file.type,
        description || null,
        now,
        now,
      ]
    );

    // Update client's last_activity_date
    await db.query(
      `UPDATE clients SET last_activity_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [now, clientId]
    );

    return createSuccessResponse({ file: result.rows[0] }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to upload file');
  }
}

