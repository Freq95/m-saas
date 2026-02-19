import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/services/[id] - Get a single service
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const serviceId = parseInt(params.id);

    const service = await db.collection('services').findOne({ id: serviceId, user_id: userId });

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
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const serviceId = parseInt(params.id);
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
      { id: serviceId, user_id: userId },
      { $set: updates }
    );
    if (updateResult.matchedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    const service = await db.collection('services').findOne({ id: serviceId, user_id: userId });
    if (!service) {
      return createErrorResponse('Not found or not authorized', 404);
    }
    return createSuccessResponse({ service: stripMongoId(service) });
  } catch (error) {
    return handleApiError(error, 'Failed to update service');
  }
}

// DELETE /api/services/[id] - Delete a service
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const serviceId = parseInt(params.id);

    // Check if service is used in any appointments
    const appointmentCount = await db.collection('appointments').countDocuments({
      service_id: serviceId,
      user_id: userId,
    });
    if (appointmentCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete service. It is used in ${appointmentCount} appointment(s).`,
          appointmentCount,
        },
        { status: 400 }
      );
    }

    const result = await db.collection('services').deleteOne({ id: serviceId, user_id: userId });
    if (result.deletedCount === 0) {
      return createErrorResponse('Not found or not authorized', 404);
    }

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete service');
  }
}
