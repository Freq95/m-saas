import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, invalidateMongoCache, parseTags, stripMongoId } from '@/lib/db/mongo-utils';
import { getClientsData } from '@/lib/server/clients';
import { findOrCreateClient } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';

// GET /api/clients - Get all clients with filtering and sorting
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { DEFAULT_USER_ID } = await import('@/lib/constants');
    const userId = parseInt(searchParams.get('userId') || DEFAULT_USER_ID.toString());
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';
    const source = searchParams.get('source') || 'all';
    const sortBy = searchParams.get('sortBy') || 'last_appointment_date';
    const sortOrder = searchParams.get('sortOrder') || 'DESC';

    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const data = await getClientsData({
      userId,
      search,
      status,
      source,
      sortBy,
      sortOrder,
      page,
      limit,
    });

    return createSuccessResponse(data);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch clients');
  }
}

// POST /api/clients - Create a new client
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDbOrThrow();
    const body = await request.json();

    // Validate input
    const { createClientSchema } = await import('@/lib/validation');
    const validationResult = createClientSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { userId, name, email, phone, source, status, tags, notes } = validationResult.data;

    // Use findOrCreateClient to avoid duplicates
    let client;
    try {
      client = await findOrCreateClient(
        userId,
        name,
        email,
        phone,
        source
      );
    } catch (error: any) {
      const { logger } = await import('@/lib/logger');
      logger.error('Error in findOrCreateClient', error instanceof Error ? error : new Error(String(error)), { name, email, phone });
      return handleApiError(error, 'Failed to create client');
    }

    const updates: Record<string, unknown> = {};

    if (status && status !== client.status) {
      updates.status = status;
    }

    if (tags && Array.isArray(tags) && tags.length > 0) {
      updates.tags = JSON.stringify(tags);
    }

    if (notes !== undefined) {
      updates.notes = notes;
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await db.collection('clients').updateOne(
        { id: client.id },
        { $set: updates }
      );

      const updatedClient = await db.collection('clients').findOne({ id: client.id });
      if (updatedClient) {
        invalidateMongoCache();
        return NextResponse.json({
          client: {
            ...stripMongoId(updatedClient),
            tags: parseTags(updatedClient.tags),
          },
        });
      }
    }

    invalidateMongoCache();
    return createSuccessResponse({
      client: {
        ...client,
        tags: parseTags(client.tags),
      },
    }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create client');
  }
}
