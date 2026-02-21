import { NextRequest } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { providersListCacheKey, invalidateReadCaches } from '@/lib/cache-keys';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';

// Cleanup classification: feature-flagged (advanced scheduling domain, no core UI dependency).
// GET /api/providers - List all providers for a user
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();

    const cacheKey = providersListCacheKey({ tenantId, userId });
    const providers = await getCached(cacheKey, 1800, async () => {
      const db = await getMongoDbOrThrow();
      return db
        .collection('providers')
        .find({ user_id: userId, tenant_id: tenantId, is_active: true })
        .project({
          _id: 1,
          id: 1,
          tenant_id: 1,
          user_id: 1,
          name: 1,
          email: 1,
          role: 1,
          color: 1,
          working_hours: 1,
          is_active: 1,
          created_at: 1,
          updated_at: 1,
        })
        .sort({ name: 1 })
        .toArray();
    });

    return createSuccessResponse({ providers });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch providers');
  }
}

// POST /api/providers - Create a new provider
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const body = await request.json();
    const { name, email, role, color, workingHours } = body;

    if (!name || !email || !role) {
      return createErrorResponse('name, email, and role are required', 400);
    }

    const db = await getMongoDbOrThrow();

    // Get next ID
    const lastProvider = await db
      .collection('providers')
      .find({ tenant_id: tenantId })
      .sort({ id: -1 })
      .limit(1)
      .toArray();
    const nextId = lastProvider.length > 0 ? lastProvider[0].id + 1 : 1;

    const provider = {
      id: nextId,
      user_id: userId,
      tenant_id: tenantId,
      name,
      email,
      role,
      color: color || '#3b82f6',
      working_hours: workingHours || {
        monday: { start: '09:00', end: '17:00', breaks: [] },
        tuesday: { start: '09:00', end: '17:00', breaks: [] },
        wednesday: { start: '09:00', end: '17:00', breaks: [] },
        thursday: { start: '09:00', end: '17:00', breaks: [] },
        friday: { start: '09:00', end: '17:00', breaks: [] },
      },
      is_active: true,
      created_at: new Date(),
    };

    await db.collection('providers').insertOne(provider);
    await invalidateReadCaches({ tenantId, userId });

    return createSuccessResponse({ provider }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create provider');
  }
}
