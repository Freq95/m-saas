import { NextRequest } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { resourcesListCacheKey, invalidateReadCaches } from '@/lib/cache-keys';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';

// Cleanup classification: feature-flagged (advanced scheduling domain, no core UI dependency).
// GET /api/resources - List all resources for a user
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();

    const cacheKey = resourcesListCacheKey({ tenantId, userId });
    const resources = await getCached(cacheKey, 1800, async () => {
      const db = await getMongoDbOrThrow();
      return db
        .collection('resources')
        .find({ user_id: userId, tenant_id: tenantId, is_active: true })
        .project({
          _id: 1,
          id: 1,
          tenant_id: 1,
          user_id: 1,
          name: 1,
          type: 1,
          is_active: 1,
          created_at: 1,
          updated_at: 1,
        })
        .sort({ name: 1 })
        .toArray();
    });

    return createSuccessResponse({ resources });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch resources');
  }
}

// POST /api/resources - Create a new resource
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const body = await request.json();
    const { name, type } = body;

    if (!name || !type) {
      return createErrorResponse('name and type are required', 400);
    }

    if (!['chair', 'room', 'equipment'].includes(type)) {
      return createErrorResponse('type must be chair, room, or equipment', 400);
    }

    const db = await getMongoDbOrThrow();

    // Get next ID
    const lastResource = await db
      .collection('resources')
      .find({ tenant_id: tenantId })
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const nextId = lastResource.length > 0 ? lastResource[0].id + 1 : 1;

    const resource = {
      id: nextId,
      user_id: userId,
      tenant_id: tenantId,
      name,
      type,
      is_active: true,
      created_at: new Date(),
    };

    await db.collection('resources').insertOne(resource);
    await invalidateReadCaches({ tenantId, userId });

    return createSuccessResponse({ resource }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create resource');
  }
}
