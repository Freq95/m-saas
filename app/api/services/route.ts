import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/services - Get services
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId') || '1';

    const result = await db.query(
      `SELECT * FROM services WHERE user_id = $1 ORDER BY name ASC`,
      [userId]
    );

    return NextResponse.json({ services: result.rows });
  } catch (error: any) {
    console.error('Error fetching services:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
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

    return NextResponse.json({ service: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating service:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create service',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

