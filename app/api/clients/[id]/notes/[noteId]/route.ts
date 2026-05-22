import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { resolveClientScopeForClient } from '@/lib/client-permissions';

type NoteCollection = 'client_notes' | 'contact_notes';

function parsePositiveId(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getNoteFilter(collectionName: NoteCollection, noteId: number, clientId: number, userId: number, tenantId: unknown) {
  return collectionName === 'client_notes'
    ? { id: noteId, client_id: clientId, user_id: userId, tenant_id: tenantId }
    : { id: noteId, contact_id: clientId, user_id: userId, tenant_id: tenantId };
}

async function findNote(args: {
  db: Awaited<ReturnType<typeof getMongoDbOrThrow>>;
  noteId: number;
  clientId: number;
  userId: number;
  tenantId: unknown;
  preferredCollection?: string | null;
}) {
  const collections: NoteCollection[] =
    args.preferredCollection === 'contact_notes'
      ? ['contact_notes', 'client_notes']
      : ['client_notes', 'contact_notes'];

  for (const collectionName of collections) {
    const filter = getNoteFilter(collectionName, args.noteId, args.clientId, args.userId, args.tenantId);
    const note = await args.db.collection(collectionName).findOne(filter);
    if (note) return { note, collectionName, filter };
  }

  return null;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string; noteId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const clientId = parsePositiveId(params.id);
    const noteId = parsePositiveId(params.noteId);
    if (!clientId) return createErrorResponse('Invalid client ID', 400);
    if (!noteId) return createErrorResponse('Invalid note ID', 400);

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const body = await request.json();
    const { createNoteSchema } = await import('@/lib/validation');
    const validationResult = createNoteSchema.safeParse({ content: body?.content });
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const db = await getMongoDbOrThrow();
    const match = await findNote({
      db,
      noteId,
      clientId,
      userId: scope.userId,
      tenantId: scope.tenantId,
      preferredCollection: typeof body?.noteCollection === 'string' ? body.noteCollection : null,
    });
    if (!match) return createErrorResponse('Note not found', 404);

    const now = new Date().toISOString();
    await db.collection(match.collectionName).updateOne(
      match.filter,
      { $set: { content: validationResult.data.content, updated_at: now } }
    );

    const updated = await db.collection(match.collectionName).findOne(match.filter);
    return createSuccessResponse({
      note: updated ? { ...stripMongoId(updated), note_collection: match.collectionName } : null,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to update note');
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string; noteId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const clientId = parsePositiveId(params.id);
    const noteId = parsePositiveId(params.noteId);
    if (!clientId) return createErrorResponse('Invalid client ID', 400);
    if (!noteId) return createErrorResponse('Invalid note ID', 400);

    const scope = await resolveClientScopeForClient(auth, clientId);
    if (!scope) return createErrorResponse('Client not found', 404);

    const db = await getMongoDbOrThrow();
    const match = await findNote({
      db,
      noteId,
      clientId,
      userId: scope.userId,
      tenantId: scope.tenantId,
      preferredCollection: request.nextUrl.searchParams.get('noteCollection'),
    });
    if (!match) return createErrorResponse('Note not found', 404);

    const result = await db.collection(match.collectionName).deleteOne(match.filter);
    if (result.deletedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete note');
  }
}
