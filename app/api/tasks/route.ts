import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// GET /api/tasks - Get tasks for a client or user
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const searchParams = request.nextUrl.searchParams;
    
    // Validate query parameters
    const { tasksQuerySchema } = await import('@/lib/validation');
    const queryParams = {
      userId: searchParams.get('userId') || '1',
      contactId: searchParams.get('contactId') || undefined,
      status: searchParams.get('status') || undefined,
    };
    
    const validationResult = tasksQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }
    
    const { userId, contactId, status } = validationResult.data;

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: (string | number)[] = [];

    if (contactId) {
      query += ` AND (client_id = $${params.length + 1} OR contact_id = $${params.length + 1})`;
      params.push(contactId);
    }

    if (userId) {
      query += ` AND user_id = $${params.length + 1}`;
      params.push(userId);
    }
    
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    query += ' ORDER BY due_date ASC, created_at DESC';

    const result = await db.query(query, params);
    return createSuccessResponse({ tasks: result.rows || [] });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch tasks');
  }
}

// POST /api/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();

    const { userId, contactId, title, description, dueDate, status, priority } = body;

    if (!userId || !title) {
      return createErrorResponse('userId and title are required', 400);
    }

    const now = new Date().toISOString();
    // Use client_id instead of contact_id (support both for migration)
    const result = await db.query(
      `INSERT INTO tasks (user_id, client_id, contact_id, title, description, due_date, status, priority, created_at, updated_at)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        userId,
        contactId || null,
        title,
        description || null,
        dueDate || null,
        status || 'open',
        priority || 'medium',
        now,
        now,
      ]
    );

    return createSuccessResponse({ task: result.rows[0] }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create task');
  }
}

