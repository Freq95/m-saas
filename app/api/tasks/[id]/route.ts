import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// GET /api/tasks/[id] - Get a single task
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const taskId = parseInt(params.id);

    // Validate ID
    if (isNaN(taskId) || taskId <= 0) {
      return createErrorResponse('Invalid task ID', 400);
    }

    const result = await db.query(
      `SELECT * FROM tasks WHERE id = $1`,
      [taskId]
    );

    if (result.rows.length === 0) {
      return createErrorResponse('Task not found', 404);
    }

    return createSuccessResponse({ task: result.rows[0] });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch task');
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
    
    // Validate ID
    if (isNaN(taskId) || taskId <= 0) {
      return createErrorResponse('Invalid task ID', 400);
    }
    
    const body = await request.json();

    // Validate input
    const { updateTaskSchema } = await import('@/lib/validation');
    const validationResult = updateTaskSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const { title, description, dueDate, status, priority } = validationResult.data;

    const updates: string[] = [];
    const updateParams: (string | number | Date | null)[] = [];

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
      return createErrorResponse('No fields to update', 400);
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
      return createErrorResponse('Task not found', 404);
    }

    return createSuccessResponse({ task: result.rows[0] });
  } catch (error) {
    return handleApiError(error, 'Failed to update task');
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

    // Validate ID
    if (isNaN(taskId) || taskId <= 0) {
      return createErrorResponse('Invalid task ID', 400);
    }

    await db.query(
      `DELETE FROM tasks WHERE id = $1`,
      [taskId]
    );

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete task');
  }
}

