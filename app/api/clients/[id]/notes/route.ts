import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// GET /api/clients/[id]/notes - Get notes for a client
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

    // Try client_notes first, fallback to contact_notes for migration
    let result;
    try {
      result = await db.query(
        `SELECT * FROM client_notes WHERE client_id = $1 ORDER BY created_at DESC`,
        [clientId]
      );
    } catch (e) {
      // Fallback to legacy contact_notes
      result = await db.query(
        `SELECT * FROM contact_notes WHERE contact_id = $1 ORDER BY created_at DESC`,
        [clientId]
      );
    }

    return createSuccessResponse({ notes: result.rows || [] });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch notes');
  }
}

// POST /api/clients/[id]/notes - Create a note for a client
export async function POST(
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
    
    const body = await request.json();

    // Validate input
    const { createNoteSchema } = await import('@/lib/validation');
    const validationResult = createNoteSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const { userId, content } = validationResult.data;

    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO client_notes (client_id, user_id, content, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [clientId, userId, content, now, now]
    );

    // Update client's last_activity_date
    await db.query(
      `UPDATE clients SET last_activity_date = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [now, clientId]
    );

    return createSuccessResponse({ note: result.rows[0] }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create note');
  }
}

