import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { getAuthUser } from '@/lib/auth-helpers';
import { createSuccessResponse, handleApiError } from '@/lib/error-handler';

// GET /api/calendar-shares/pending - List pending shares for current user
export async function GET(_request: NextRequest) {
  try {
    const { dbUserId, email } = await getAuthUser();
    const normalizedEmail = email.toLowerCase().trim();
    const db = await getMongoDbOrThrow();
    const now = new Date();

    const shareDocs = await db.collection('calendar_shares').find({
      status: 'pending',
      $and: [
        {
          $or: normalizedEmail
            ? [
                { shared_with_user_id: dbUserId },
                { shared_with_email: normalizedEmail },
              ]
            : [{ shared_with_user_id: dbUserId }],
        },
        {
          $or: [
            { expires_at: null },
            { expires_at: { $exists: false } },
            { expires_at: { $gt: now } },
          ],
        },
      ],
    }).sort({ created_at: -1 }).toArray();

    const calendarIds = shareDocs
      .map((share: any) => share.calendar_id)
      .filter((id: unknown): id is number => typeof id === 'number');
    const calendars = calendarIds.length > 0
      ? await db.collection('calendars').find({
          id: { $in: calendarIds },
          is_active: true,
          deleted_at: { $exists: false },
        }).toArray()
      : [];
    const calendarById = new Map<number, any>(
      calendars
        .filter((calendar: any) => typeof calendar.id === 'number')
        .map((calendar: any) => [calendar.id, calendar])
    );

    const pendingShares = shareDocs
      .map((share: any) => {
        const calendar = calendarById.get(share.calendar_id);
        if (!calendar) {
          return null;
        }
        return {
          ...stripMongoId(share),
          calendar: stripMongoId(calendar),
        };
      })
      .filter(Boolean);

    return createSuccessResponse({ pendingShares });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch pending calendar shares');
  }
}
