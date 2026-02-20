import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/tasks - Get tasks for a client or user
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const searchParams = request.nextUrl.searchParams;

    // Validate query parameters
    const { tasksQuerySchema } = await import('@/lib/validation');
    const queryParams = {
      userId: String(userId),
      contactId: searchParams.get('contactId') || undefined,
      status: searchParams.get('status') || undefined,
    };

    const validationResult = tasksQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }

    const { contactId, status } = validationResult.data;

    const filter: Record<string, any> = { user_id: userId, tenant_id: tenantId };
    if (contactId) {
      filter.$or = [{ client_id: contactId }, { contact_id: contactId }];
    }
    if (status) {
      filter.status = status;
    }

    const tasks = await db
      .collection('tasks')
      .find(filter)
      .sort({ due_date: 1, created_at: -1 })
      .toArray();

    return createSuccessResponse({ tasks: tasks.map(stripMongoId) });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch tasks');
  }
}

// POST /api/tasks - Create a new task
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const body = await request.json();

    const { contactId, title, description, dueDate, status, priority } = body;

    if (!title) {
      return createErrorResponse('title is required', 400);
    }

    const now = new Date().toISOString();
    const taskId = await getNextNumericId('tasks');
    const taskDoc = {
      _id: taskId,
      id: taskId,
      tenant_id: tenantId,
      user_id: userId,
      client_id: contactId || null,
      contact_id: contactId || null,
      title,
      description: description || null,
      due_date: dueDate || null,
      status: status || 'open',
      priority: priority || 'medium',
      created_at: now,
      updated_at: now,
    };

    await db.collection('tasks').insertOne(taskDoc);

    return createSuccessResponse({ task: stripMongoId(taskDoc) }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create task');
  }
}
