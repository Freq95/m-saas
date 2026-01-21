import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/tasks - Get tasks for a contact or user
export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    const searchParams = request.nextUrl.searchParams;
    const contactId = searchParams.get('contactId');
    const userId = searchParams.get('userId');

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (contactId) {
      query += ` AND contact_id = $${params.length + 1}`;
      params.push(parseInt(contactId));
    }

    if (userId) {
      query += ` AND user_id = $${params.length + 1}`;
      params.push(parseInt(userId));
    }

    query += ' ORDER BY due_date ASC, created_at DESC';

    const result = await db.query(query, params);
    return NextResponse.json({ tasks: result.rows || [] });
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tasks', details: error.message },
      { status: 500 }
    );
  }
}

// POST /api/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const db = getDb();
    const body = await request.json();

    const { userId, contactId, title, description, dueDate, status, priority } = body;

    if (!userId || !title) {
      return NextResponse.json(
        { error: 'userId and title are required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const result = await db.query(
      `INSERT INTO tasks (user_id, contact_id, title, description, due_date, status, priority, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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

    return NextResponse.json({ task: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: 'Failed to create task', details: error.message },
      { status: 500 }
    );
  }
}

