import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET /api/tasks/[id] - Get a single task
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const taskId = parseInt(params.id);

    const result = await db.query(
      `SELECT * FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ task: result.rows[0] });
  } catch (error: any) {
    console.error('Error fetching task:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task', details: error.message },
      { status: 500 }
    );
  }
}

// PATCH /api/tasks/[id] - Update a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const taskId = parseInt(params.id);
    const body = await request.json();

    const { title, description, dueDate, status, priority } = body;

    const updates: string[] = [];
    const updateParams: any[] = [];

    if (title !== undefined) {
      updates.push(`title = $${updateParams.length + 1}`);
      updateParams.push(title);
    }

    if (description !== undefined) {
      updates.push(`description = $${updateParams.length + 1}`);
      updateParams.push(description);
    }

    if (dueDate !== undefined) {
      updates.push(`due_date = $${updateParams.length + 1}`);
      updateParams.push(dueDate);
    }

    if (status !== undefined) {
      updates.push(`status = $${updateParams.length + 1}`);
      updateParams.push(status);
    }

    if (priority !== undefined) {
      updates.push(`priority = $${updateParams.length + 1}`);
      updateParams.push(priority);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    updateParams.push(taskId);

    await db.query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = $${updateParams.length}`,
      updateParams
    );

    // Reload task
    const result = await db.query(
      `SELECT * FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ task: result.rows[0] });
  } catch (error: any) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Failed to update task', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/[id] - Delete a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const taskId = parseInt(params.id);

    await db.query(
      `DELETE FROM tasks WHERE id = $1`,
      [taskId]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting task:', error);
    return NextResponse.json(
      { error: 'Failed to delete task', details: error.message },
      { status: 500 }
    );
  }
}

