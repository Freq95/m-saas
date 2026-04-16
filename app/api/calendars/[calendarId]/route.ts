import { NextRequest } from 'next/server';
import {
  getCalendarAuth,
  getCalendarById,
  normalizeCalendarPermissions,
  OWNER_CALENDAR_PERMISSIONS,
} from '@/lib/calendar-auth';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkUpdateRateLimit } from '@/lib/rate-limit';

function parseCalendarId(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function requireCalendarOwner(auth: Awaited<ReturnType<typeof getAuthUser>>, calendarId: number) {
  const calendarAuth = await getCalendarAuth(auth, calendarId);
  if (!calendarAuth.isOwner) {
    throw new Error('FORBIDDEN_OWNER_ONLY');
  }
  const calendar = await getCalendarById(calendarId);
  if (!calendar) {
    throw new Error('Calendar not found');
  }
  return { calendarAuth, calendar };
}

// GET /api/calendars/[calendarId] - Get calendar details
export async function GET(_request: NextRequest, props: { params: Promise<{ calendarId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const calendarId = parseCalendarId(params.calendarId);
    if (!calendarId) {
      return createErrorResponse('Invalid calendar ID', 400);
    }

    const calendarAuth = await getCalendarAuth(auth, calendarId);
    const calendar = await getCalendarById(calendarId);
    if (!calendar) {
      return createErrorResponse('Calendar not found', 404);
    }

    let shares: any[] = [];
    if (calendarAuth.isOwner) {
      const db = await getMongoDbOrThrow();
      const shareDocs = await db.collection('calendar_shares').find({
        calendar_id: calendarId,
      }).sort({ created_at: -1 }).toArray();

      const userIds = shareDocs
        .map((share: any) => share.shared_with_user_id)
        .filter(Boolean);
      const users = userIds.length > 0
        ? await db.collection('users').find({ _id: { $in: userIds } }).toArray()
        : [];
      const userById = new Map<string, any>(users.map((user: any) => [String(user._id), user]));

      shares = shareDocs.map((share: any) => ({
        ...stripMongoId(share),
        recipientName: share.shared_with_user_id ? userById.get(String(share.shared_with_user_id))?.name || null : null,
      }));
    }

    return createSuccessResponse({
      calendar: {
        ...stripMongoId(calendar as any),
        isOwner: calendarAuth.isOwner,
        permissions: calendarAuth.isOwner
          ? OWNER_CALENDAR_PERMISSIONS
          : normalizeCalendarPermissions(calendarAuth.permissions),
      },
      shares,
    });
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN_OWNER_ONLY') {
      return createErrorResponse('Only the calendar owner can manage this calendar', 403);
    }
    return handleApiError(error, 'Failed to fetch calendar');
  }
}

// PATCH /api/calendars/[calendarId] - Update a calendar
export async function PATCH(request: NextRequest, props: { params: Promise<{ calendarId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const { userId, dbUserId, tenantId } = auth;
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;
    const calendarId = parseCalendarId(params.calendarId);
    if (!calendarId) {
      return createErrorResponse('Invalid calendar ID', 400);
    }

    const body = await request.json();
    const { updateCalendarSchema } = await import('@/lib/validation');
    const validationResult = updateCalendarSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse(validationResult.error.errors[0]?.message || 'Invalid input', 400);
    }

    await requireCalendarOwner(auth, calendarId);
    const { name, color_mine, color_others } = validationResult.data;
    const updates: Record<string, unknown> = {};

    if (name !== undefined) updates.name = name;
    if (color_mine !== undefined) updates.color_mine = color_mine;
    if (color_others !== undefined) updates.color_others = color_others;

    if (Object.keys(updates).length === 0) {
      return createErrorResponse('No fields to update', 400);
    }

    updates.updated_at = new Date().toISOString();

    const db = await getMongoDbOrThrow();
    await db.collection('calendars').updateOne(
      { id: calendarId, is_active: true, deleted_at: { $exists: false } },
      { $set: updates }
    );

    const updatedCalendar = await getCalendarById(calendarId);
    if (!updatedCalendar) {
      return createErrorResponse('Calendar not found', 404);
    }

    await invalidateReadCaches({
      tenantId,
      userId,
      calendarId,
      viewerDbUserId: dbUserId,
    });

    return createSuccessResponse({ calendar: stripMongoId(updatedCalendar as any) });
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN_OWNER_ONLY') {
      return createErrorResponse('Only the calendar owner can manage this calendar', 403);
    }
    return handleApiError(error, 'Failed to update calendar');
  }
}

// DELETE /api/calendars/[calendarId] - Soft-delete a calendar
export async function DELETE(_request: NextRequest, props: { params: Promise<{ calendarId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const { userId, dbUserId, tenantId } = auth;
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;
    const calendarId = parseCalendarId(params.calendarId);
    if (!calendarId) {
      return createErrorResponse('Invalid calendar ID', 400);
    }

    const { calendar } = await requireCalendarOwner(auth, calendarId);
    if (calendar.is_default) {
      return createErrorResponse('Nu poti sterge calendarul implicit', 400);
    }

    const db = await getMongoDbOrThrow();
    const now = new Date().toISOString();
    await db.collection('calendars').updateOne(
      { id: calendarId, is_active: true, deleted_at: { $exists: false } },
      {
        $set: {
          is_active: false,
          deleted_at: now,
          deleted_by: dbUserId,
          updated_at: now,
        },
      }
    );
    await db.collection('calendar_shares').updateMany(
      {
        calendar_id: calendarId,
        status: { $in: ['pending', 'accepted'] },
      },
      {
        $set: {
          status: 'revoked',
          expires_at: null,
          invite_token_hash: null,
          updated_at: now,
        },
      }
    );

    await invalidateReadCaches({
      tenantId,
      userId,
      calendarId,
      viewerDbUserId: dbUserId,
    });

    return createSuccessResponse({ success: true });
  } catch (error: any) {
    if (error?.message === 'FORBIDDEN_OWNER_ONLY') {
      return createErrorResponse('Only the calendar owner can manage this calendar', 403);
    }
    return handleApiError(error, 'Failed to delete calendar');
  }
}
