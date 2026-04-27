import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import { getOrCreateDefaultCalendar } from '@/lib/calendar-auth';
import { getAuthUser } from '@/lib/auth-helpers';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkWriteRateLimit } from '@/lib/rate-limit';
import { createCalendarSchema } from '@/lib/validation';
import { getCalendarListForUser } from '@/lib/server/calendars-list';

// GET /api/calendars - List own and shared calendars
export async function GET(_request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const payload = await getCalendarListForUser(auth);
    return createSuccessResponse(payload);
  } catch (error) {
    return handleApiError(error, 'Failed to fetch calendars');
  }
}

// POST /api/calendars - Create a calendar
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const { userId, dbUserId, tenantId, role } = auth;
    if (role !== 'owner') {
      return createErrorResponse('Only clinic owner can create calendars', 403);
    }
    const limited = await checkWriteRateLimit(userId);
    if (limited) return limited;

    const body = await request.json();
    const validationResult = createCalendarSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse(validationResult.error.errors[0]?.message || 'Invalid input', 400);
    }

    const { name } = validationResult.data;
    await getOrCreateDefaultCalendar(auth);

    const db = await getMongoDbOrThrow();

    const calendarId = await getNextNumericId('calendars');
    const now = new Date().toISOString();
    const calendarDoc = {
      _id: calendarId,
      id: calendarId,
      tenant_id: tenantId,
      owner_user_id: userId,
      owner_db_user_id: dbUserId,
      name,
      is_default: false,
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    await db.collection<FlexDoc>('calendars').insertOne(calendarDoc);
    await invalidateReadCaches({
      tenantId,
      userId,
      calendarId,
      viewerDbUserId: dbUserId,
    });

    return createSuccessResponse({ calendar: stripMongoId(calendarDoc) }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create calendar');
  }
}
