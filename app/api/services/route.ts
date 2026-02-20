import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getServicesData } from '@/lib/server/calendar';
import { getAuthUser } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { servicesListCacheKey, invalidateReadCaches } from '@/lib/cache-keys';

// GET /api/services - Get services
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const cacheKey = servicesListCacheKey({ tenantId, userId });
    const payload = await getCached(cacheKey, 1800, async () => {
      const services = await getServicesData(userId, tenantId);
      return { services };
    });

    return createSuccessResponse(payload);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch services');
  }
}

// POST /api/services - Create service
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const body = await request.json();

    // Validate input
    const { createServiceSchema } = await import('@/lib/validation');
    const validationResult = createServiceSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { name, durationMinutes, price, description } = validationResult.data;
    const now = new Date().toISOString();
    const serviceId = await getNextNumericId('services');
    const serviceDoc = {
      _id: serviceId,
      id: serviceId,
      tenant_id: tenantId,
      user_id: userId,
      name,
      duration_minutes: durationMinutes,
      price: price || null,
      description: description || null,
      created_at: now,
      updated_at: now,
    };

    await db.collection('services').insertOne(serviceDoc);
    await invalidateReadCaches({ tenantId, userId });

    return createSuccessResponse({ service: stripMongoId(serviceDoc) }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create service');
  }
}
