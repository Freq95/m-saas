import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, invalidateMongoCache, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// GET /api/tasks/[id] - Get a single task
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const taskId = parseInt(params.id);

    // Validate ID
    if (isNaN(taskId) || taskId <= 0) {
      return createErrorResponse('Invalid task ID', 400);
    }

    const task = await db.collection('tasks').findOne({ id: taskId });

    if (!task) {
      return createErrorResponse('Task not found', 404);
    }

    return createSuccessResponse({ task: stripMongoId(task) });
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
    const db = await getMongoDbOrThrow();
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
    const updates: Record<string, any> = {};

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (dueDate !== undefined) updates.due_date = dueDate;
    if (status !== undefined) updates.status = status;
    if (priority !== undefined) updates.priority = priority;

    if (Object.keys(updates).length === 0) {
      return createErrorResponse('No fields to update', 400);
    }

    updates.updated_at = new Date().toISOString();

    await db.collection('tasks').updateOne(
      { id: taskId },
      { $set: updates }
    );

    const task = await db.collection('tasks').findOne({ id: taskId });
    if (!task) {
      return createErrorResponse('Task not found', 404);
    }

    invalidateMongoCache();
    return createSuccessResponse({ task: stripMongoId(task) });
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
    const db = await getMongoDbOrThrow();
    const taskId = parseInt(params.id);

    // Validate ID
    if (isNaN(taskId) || taskId <= 0) {
      return createErrorResponse('Invalid task ID', 400);
    }

    await db.collection('tasks').deleteOne({ id: taskId });
    invalidateMongoCache();

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to delete task');
  }
}
