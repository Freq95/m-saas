import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';
import {
  getOrCreateDefaultCalendar,
  normalizeCalendarPermissions,
  OWNER_CALENDAR_PERMISSIONS,
} from '@/lib/calendar-auth';
import { getAuthUser } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { calendarListCacheKey, invalidateReadCaches } from '@/lib/cache-keys';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { checkWriteRateLimit } from '@/lib/rate-limit';

function sortCalendars(items: any[]): any[] {
  return [...items].sort((a, b) => {
    if (Boolean(a.is_default) !== Boolean(b.is_default)) {
      return a.is_default ? -1 : 1;
    }
    return String(a.name || '').localeCompare(String(b.name || ''), 'ro');
  });
}

// GET /api/calendars - List own and shared calendars
export async function GET(_request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const { dbUserId, userId, tenantId, email } = auth;

    const payload = await getCached(calendarListCacheKey(dbUserId), 120, async () => {
      await getOrCreateDefaultCalendar(auth);
      const db = await getMongoDbOrThrow();
      const normalizedEmail = email.toLowerCase().trim();

      const [ownCalendarDocs, acceptedShares] = await Promise.all([
        db.collection('calendars').find({
          tenant_id: tenantId,
          owner_user_id: userId,
          is_active: true,
          deleted_at: { $exists: false },
        }).toArray(),
        db.collection('calendar_shares').find({
          status: 'accepted',
          $or: normalizedEmail
            ? [
                { shared_with_user_id: dbUserId },
                { shared_with_email: normalizedEmail },
              ]
            : [{ shared_with_user_id: dbUserId }],
        }).toArray(),
      ]);

      const ownCalendarIds = ownCalendarDocs
        .map((c: any) => c.id)
        .filter((id: unknown): id is number => typeof id === 'number');

      const sharedCalendarIds = acceptedShares
        .map((share: any) => share.calendar_id)
        .filter((id: unknown): id is number => typeof id === 'number');
      const sharedCalendarDocs = sharedCalendarIds.length > 0
        ? await db.collection('calendars').find({
            id: { $in: sharedCalendarIds },
            is_active: true,
            deleted_at: { $exists: false },
          }).toArray()
        : [];

      const sharedCalendarMap = new Map<number, any>(
        sharedCalendarDocs
          .filter((calendar: any) => typeof calendar.id === 'number')
          .map((calendar: any) => [calendar.id, calendar])
      );

      const ownCalendars = sortCalendars(
        ownCalendarDocs.map((calendar: any) => ({
          ...stripMongoId(calendar),
          isOwner: true,
          permissions: OWNER_CALENDAR_PERMISSIONS,
          shareId: null,
        }))
      );

      const sharedCalendars = acceptedShares
        .map((share: any) => {
          const calendar = sharedCalendarMap.get(share.calendar_id);
          if (!calendar) {
            return null;
          }
          return {
            ...stripMongoId(calendar),
            isOwner: false,
            permissions: normalizeCalendarPermissions(share.permissions),
            shareId: typeof share.id === 'number' ? share.id : null,
            sharedByName: typeof share.shared_by_name === 'string' ? share.shared_by_name : null,
            dentistDisplayName: typeof share.dentist_display_name === 'string' ? share.dentist_display_name : null,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), 'ro'));

      const sentPendingShareDocs = ownCalendarIds.length > 0
        ? await db.collection('calendar_shares').find({
            calendar_id: { $in: ownCalendarIds },
            status: 'pending',
          }).sort({ created_at: -1 }).toArray()
        : [];

      const sentPendingShares = sentPendingShareDocs.map((share: any) => ({
        id: typeof share.id === 'number' ? share.id : 0,
        calendar_id: share.calendar_id,
        shared_with_email: share.shared_with_email || '',
        dentist_display_name: typeof share.dentist_display_name === 'string' ? share.dentist_display_name : null,
        created_at: share.created_at || null,
      }));

      return {
        ownCalendars,
        sharedCalendars,
        sentPendingShares,
      };
    });

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
    const { createCalendarSchema } = await import('@/lib/validation');
    const validationResult = createCalendarSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse(validationResult.error.errors[0]?.message || 'Invalid input', 400);
    }

    const { name, color_mine, color_others } = validationResult.data;
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
      color_mine: color_mine || '#2563EB',
      color_others: color_others || '#64748B',
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
