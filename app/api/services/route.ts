import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';

// GET /api/services - Get services
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
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

    const result = await db.query(
      `SELECT * FROM services WHERE user_id = $1 ORDER BY name ASC`,
      [userId]
    );

    return createSuccessResponse({ services: result.rows });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch services');
  }
}

// POST /api/services - Create service
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    
    // Validate input
    const { createServiceSchema } = await import('@/lib/validation');
    const validationResult = createServiceSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const { userId, name, durationMinutes, price, description } = validationResult.data;

    const result = await db.query(
      `INSERT INTO services (user_id, name, duration_minutes, price, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, name, durationMinutes, price || null, description || null]
    );

    return createSuccessResponse({ service: result.rows[0] }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create service');
  }
}

