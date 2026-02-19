import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/clients/[id]/notes - Get notes for a client
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);

    // Validate ID
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    let notes = await db
      .collection('client_notes')
      .find({ client_id: clientId, user_id: userId })
      .sort({ created_at: -1 })
      .toArray();

    if (notes.length === 0) {
      notes = await db
        .collection('contact_notes')
        .find({ contact_id: clientId, user_id: userId })
        .sort({ created_at: -1 })
        .toArray();
    }

    return createSuccessResponse({ notes: notes.map(stripMongoId) });
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
    const { userId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
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

    const { content } = validationResult.data;

    const now = new Date().toISOString();
    const noteId = await getNextNumericId('client_notes');
    const noteDoc = {
      _id: noteId,
      id: noteId,
      client_id: clientId,
      user_id: userId,
      content,
      created_at: now,
      updated_at: now,
    };

    await db.collection('client_notes').insertOne(noteDoc);

    // Update client's last_activity_date
    await db.collection('clients').updateOne(
      { id: clientId, user_id: userId },
      { $set: { last_activity_date: now, updated_at: now } }
    );
    return createSuccessResponse({ note: stripMongoId(noteDoc) }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create note');
  }
}
