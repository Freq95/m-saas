import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, invalidateMongoCache, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';

// GET /api/services/[id] - Get a single service
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const serviceId = parseInt(params.id);

    const service = await db.collection('services').findOne({ id: serviceId });

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
    await db.collection('services').updateOne({ id: serviceId }, { $set: updates });

    const service = await db.collection('services').findOne({ id: serviceId });
    if (!service) {
      return NextResponse.json(
        { error: 'Service not found' },
        { status: 404 }
      );
    }

    invalidateMongoCache();
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
    const db = await getMongoDbOrThrow();
    const serviceId = parseInt(params.id);

    // Check if service is used in any appointments
    const appointmentCount = await db.collection('appointments').countDocuments({ service_id: serviceId });
    if (appointmentCount > 0) {
      return NextResponse.json(
        {
          error: `Cannot delete service. It is used in ${appointmentCount} appointment(s).`,
          appointmentCount,
        },
        { status: 400 }
      );
    }

    await db.collection('services').deleteOne({ id: serviceId });
    invalidateMongoCache();

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete service');
  }
}
