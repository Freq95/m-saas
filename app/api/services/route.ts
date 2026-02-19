import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getServicesData } from '@/lib/server/calendar';

// GET /api/services - Get services
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters
    const { servicesQuerySchema } = await import('@/lib/validation');
    const queryParams = {
      userId: searchParams.get('userId') || '1',
    };

    const validationResult = servicesQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }

    const { userId } = validationResult.data;
    const services = await getServicesData(userId);

    return createSuccessResponse({ services });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch services');
  }
}

// POST /api/services - Create service
export async function POST(request: NextRequest) {
  try {
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

    const { userId, name, durationMinutes, price, description } = validationResult.data;
    const now = new Date().toISOString();
    const serviceId = await getNextNumericId('services');
    const serviceDoc = {
      _id: serviceId,
      id: serviceId,
      user_id: userId,
      name,
      duration_minutes: durationMinutes,
      price: price || null,
      description: description || null,
      created_at: now,
      updated_at: now,
    };

    await db.collection('services').insertOne(serviceDoc);

    return createSuccessResponse({ service: stripMongoId(serviceDoc) }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create service');
  }
}
