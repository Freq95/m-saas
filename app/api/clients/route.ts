import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { findOrCreateClient, Client } from '@/lib/client-matching';

// GET /api/clients - Get all clients with filtering and sorting
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const searchParams = request.nextUrl.searchParams;
    const userId = parseInt(searchParams.get('userId') || '1');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';
    const source = searchParams.get('source') || 'all';
    const sortBy = searchParams.get('sortBy') || 'last_appointment_date';
    const sortOrder = searchParams.get('sortOrder') || 'DESC';

    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build query
    let query = `SELECT * FROM clients WHERE user_id = $1`;
    const params: any[] = [userId];

    // Add search filter
    if (search) {
      query += ` AND (LOWER(name) LIKE LOWER($${params.length + 1}) 
               OR LOWER(email) LIKE LOWER($${params.length + 1}) 
               OR phone LIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    // Add status filter
    if (status !== 'all') {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    // Add source filter
    if (source !== 'all') {
      query += ` AND source = $${params.length + 1}`;
      params.push(source);
    }

    // Add sorting
    const validSortColumns = ['name', 'email', 'total_spent', 'total_appointments', 
                              'last_appointment_date', 'last_conversation_date', 'last_activity_date', 'created_at'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'last_activity_date';
    const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortColumn} ${sortDirection} NULLS LAST`;

    // Get total count for pagination
    const countQuery = query.replace(/SELECT \*/, 'SELECT COUNT(*) as total');
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.total || '0');

    // Add pagination
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);
    const clients = result.rows || [];

    // Parse tags from JSON string if needed
    const clientsWithParsedTags = clients.map((client: any) => ({
      ...client,
      tags: typeof client.tags === 'string' ? JSON.parse(client.tags || '[]') : (client.tags || []),
    }));

    return NextResponse.json({ 
      clients: clientsWithParsedTags,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error: any) {
    console.error('Error fetching clients:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clients', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/clients - Create a new client
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();
    
    // Validate input
    const { createClientSchema } = await import('@/lib/validation');
    const validationResult = createClientSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const { userId, name, email, phone, source, status, tags, notes } = validationResult.data;

    // Use findOrCreateClient to avoid duplicates
    let client;
    try {
      client = await findOrCreateClient(
        userId,
        name,
        email,
        phone,
        source
      );
    } catch (error: any) {
      console.error('Error in findOrCreateClient:', error);
      return NextResponse.json(
        { error: 'Failed to create client', details: error.message },
        { status: 500 }
      );
    }

    // Update status, tags, and notes if provided
    const updates: string[] = [];
    const updateParams: any[] = [];

    if (status && status !== client.status) {
      updates.push(`status = $${updateParams.length + 1}`);
      updateParams.push(status);
    }

    if (tags && Array.isArray(tags) && tags.length > 0) {
      updates.push(`tags = $${updateParams.length + 1}`);
      updateParams.push(JSON.stringify(tags));
    }

    if (notes !== undefined) {
      updates.push(`notes = $${updateParams.length + 1}`);
      updateParams.push(notes);
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      updateParams.push(client.id);
      
      await db.query(
        `UPDATE clients SET ${updates.join(', ')} WHERE id = $${updateParams.length}`,
        updateParams
      );

      // Reload client
      const updatedResult = await db.query(
        `SELECT * FROM clients WHERE id = $1`,
        [client.id]
      );
      
      if (updatedResult.rows.length > 0) {
        const updatedClient = updatedResult.rows[0];
        return NextResponse.json({
          client: {
            ...updatedClient,
            tags: typeof updatedClient.tags === 'string' 
              ? JSON.parse(updatedClient.tags || '[]') 
              : (updatedClient.tags || []),
          }
        });
      }
    }

    return NextResponse.json({
      client: {
        ...client,
        tags: typeof client.tags === 'string' 
          ? JSON.parse(client.tags || '[]') 
          : (client.tags || []),
      }
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating client:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create client',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

