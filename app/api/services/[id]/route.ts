import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { checkUpdateRateLimit } from '@/lib/rate-limit';

// GET /api/services/[id] - Get a single service
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const serviceId = parseInt(params.id);
    if (isNaN(serviceId) || serviceId <= 0) {
      return createErrorResponse('Invalid service ID', 400);
    }

    const service = await db.collection('services').findOne({ id: serviceId, user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } });

    if (!service) {
      return NextResponse.json(
        { error: 'Service not found' },
        { status: 404 }
      );
    }

    return createSuccessResponse({ service: stripMongoId(service) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch service');
  }
}

// PATCH /api/services/[id] - Update a service
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId, tenantId } = await getAuthUser();
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;
    const db = await getMongoDbOrThrow();
    const serviceId = parseInt(params.id);
    if (isNaN(serviceId) || serviceId <= 0) {
      return createErrorResponse('Invalid service ID', 400);
    }
    const body = await request.json();

    // Validate input
    const { updateServiceSchema } = await import('@/lib/validation');
    const validationResult = updateServiceSchema.safeParse(body);
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
    const updates: Record<string, any> = {};

    if (name !== undefined) updates.name = name;
    if (durationMinutes !== undefined) updates.duration_minutes = durationMinutes;
    if (price !== undefined) updates.price = price;
    if (description !== undefined) updates.description = description;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    updates.updated_at = new Date().toISOString();
    const updateResult = await db.collection('services').updateOne(
      { id: serviceId, user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } },
      { $set: updates }
    );
    if (updateResult.matchedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const service = await db.collection('services').findOne({ id: serviceId, user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } });
    if (!service) {
      return createErrorResponse('Not found or not authorized', 404);
    }
    await invalidateReadCaches({ tenantId, userId });
    return createSuccessResponse({ service: stripMongoId(service) });
  } catch (error) {
    return handleApiError(error, 'Failed to update service');
  }
}

// DELETE /api/services/[id] - Delete a service
export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId, tenantId } = await getAuthUser();
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;
    const db = await getMongoDbOrThrow();
    const serviceId = parseInt(params.id);
    if (isNaN(serviceId) || serviceId <= 0) {
      return createErrorResponse('Invalid service ID', 400);
    }

    const now = new Date().toISOString();
    const result = await db.collection('services').updateOne(
      { id: serviceId, user_id: userId, tenant_id: tenantId, deleted_at: { $exists: false } },
      { $set: { deleted_at: now, deleted_by: userId, updated_at: now } }
    );
    if (result.matchedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }
    await invalidateReadCaches({ tenantId, userId });

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete service');
  }
}
