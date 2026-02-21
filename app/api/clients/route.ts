import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getClientsData } from '@/lib/server/clients';
import { findOrCreateClient } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { clientsListCacheKey, invalidateReadCaches } from '@/lib/cache-keys';

// GET /api/clients - Get all clients with filtering and sorting
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const { userId, tenantId } = await getAuthUser();
    const search = searchParams.get('search') || '';
    const sortBy = searchParams.get('sortBy') || 'last_appointment_date';
    const sortOrder = searchParams.get('sortOrder') || 'DESC';

    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const cacheKey = clientsListCacheKey(
      { tenantId, userId },
      { search, sortBy, sortOrder, page, limit }
    );
    const data = await getCached(cacheKey, 120, async () =>
      getClientsData({
        userId,
        tenantId,
        search,
        sortBy,
        sortOrder,
        page,
        limit,
      })
    );

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

    const { userId, tenantId } = await getAuthUser();
    const { name, email, phone, notes } = validationResult.data;

    // Use findOrCreateClient to avoid duplicates
    let client;
    try {
      client = await findOrCreateClient(
        userId,
        tenantId,
        name,
        email,
        phone
      );
    } catch (error: any) {
      const { logger } = await import('@/lib/logger');
      logger.error('Error in findOrCreateClient', error instanceof Error ? error : new Error(String(error)), { name, email, phone });
      return handleApiError(error, 'Failed to create client');
    }

    const updates: Record<string, unknown> = {};

    if (notes !== undefined) {
      updates.notes = notes;
    }

    let responseClient = client;
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      await db.collection('clients').updateOne(
        { id: client.id, tenant_id: tenantId },
        { $set: updates }
      );
      responseClient = {
        ...client,
        ...updates,
      };
    }
    await invalidateReadCaches({ tenantId, userId });
    return createSuccessResponse({
      client: responseClient,
    }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create client');
  }
}
