import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, invalidateMongoCache, parseTags, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getClientProfileData } from '@/lib/server/client-profile';

// GET /api/clients/[id] - Get client details with history
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = parseInt(params.id);
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    const profile = await getClientProfileData(clientId);
    if (!profile) {
      return createErrorResponse('Client not found', 404);
    }

    return createSuccessResponse(profile);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch client');
  }
}

// PATCH /api/clients/[id] - Update client
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }
    const body = await request.json();

    const { DEFAULT_USER_ID } = await import('@/lib/constants');
    const userId = body.userId ?? DEFAULT_USER_ID;

    // Verify client exists and belongs to this user before updating
    const existing = await db.collection('clients').findOne({ id: clientId, user_id: userId });
    if (!existing) {
      return createErrorResponse('Client not found', 404);
    }

    // Validate input
    const { updateClientSchema } = await import('@/lib/validation');
    const validationResult = updateClientSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const { name, email, phone, status, tags, notes } = validationResult.data;

    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      updates.name = name.trim();
    }

    if (email !== undefined) {
      updates.email = email ? email.toLowerCase().trim() : null;
    }

    if (phone !== undefined) {
      updates.phone = phone ? phone.trim() : null;
    }

    if (status !== undefined) {
      updates.status = status;
    }

    if (tags !== undefined && Array.isArray(tags)) {
      updates.tags = JSON.stringify(tags);
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    if (Object.keys(updates).length === 0) {
      return createErrorResponse('No fields to update', 400);
    }

    updates.updated_at = new Date().toISOString();

    await db.collection('clients').updateOne(
      { id: clientId, user_id: userId },
      { $set: updates }
    );

    const result = await db.collection('clients').findOne({ id: clientId, user_id: userId });
    if (!result) {
      return createErrorResponse('Client not found', 404);
    }

    invalidateMongoCache();

    return createSuccessResponse({
      client: {
        ...stripMongoId(result),
        tags: parseTags(result.tags),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to update client');
  }
}

// DELETE /api/clients/[id] - Delete client (soft delete by setting status to 'deleted')
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const clientId = parseInt(params.id);
    if (isNaN(clientId) || clientId <= 0) {
      return createErrorResponse('Invalid client ID', 400);
    }

    const { DEFAULT_USER_ID } = await import('@/lib/constants');
    const searchParams = request.nextUrl.searchParams;
    const userId = parseInt(searchParams.get('userId') || DEFAULT_USER_ID.toString());

    // Verify client exists and belongs to this user
    const existing = await db.collection('clients').findOne({ id: clientId, user_id: userId });
    if (!existing) {
      return createErrorResponse('Client not found', 404);
    }

    // Soft delete: set status to 'deleted'
    await db.collection('clients').updateOne(
      { id: clientId, user_id: userId },
      { $set: { status: 'deleted', updated_at: new Date().toISOString() } }
    );

    invalidateMongoCache();
    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete client');
  }
}
