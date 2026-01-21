import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'contacts');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// GET /api/clients/[id]/files - Get files for a contact
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const contactId = parseInt(params.id);

    const result = await db.query(
      `SELECT * FROM contact_files WHERE contact_id = $1 ORDER BY created_at DESC`,
      [contactId]
    );

    return NextResponse.json({ files: result.rows || [] });
  } catch (error: any) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      { error: 'Failed to fetch files', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/clients/[id]/files - Upload a file for a contact
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const contactId = parseInt(params.id);
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const description = formData.get('description') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${contactId}_${timestamp}_${sanitizedName}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    fs.writeFileSync(filepath, buffer);

    // Save file metadata to database
    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO contact_files (contact_id, filename, original_filename, file_path, file_size, mime_type, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        contactId,
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

    // Update contact's last_activity_date
    await db.query(
      `UPDATE clients SET last_activity_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [now, contactId]
    );

    return NextResponse.json({ file: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error.message },
      { status: 500 }
    );
  }
}

