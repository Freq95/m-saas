import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import {
  getOrCreateDefaultCalendar,
  normalizeCalendarPermissions,
  OWNER_CALENDAR_PERMISSIONS,
} from '@/lib/calendar-auth';
import { getCached } from '@/lib/redis';
import { calendarListCacheKey } from '@/lib/cache-keys';
import { isDentistColorId, getDentistColorHex, DEFAULT_COLOR_MINE } from '@/lib/calendar-color-policy';
import type { AuthContext } from '@/lib/auth-helpers';

export interface CalendarListPayload {
  ownCalendars: any[];
  sharedCalendars: any[];
  sentPendingShares: Array<{
    id: number;
    calendar_id: number;
    shared_with_email: string;
    dentist_display_name: string | null;
    created_at: string | null;
  }>;
}

export interface PendingShareListPayload {
  pendingShares: any[];
}

function sortCalendars(items: any[]): any[] {
  return [...items].sort((a, b) => {
    if (Boolean(a.is_default) !== Boolean(b.is_default)) {
      return a.is_default ? -1 : 1;
    }
    return String(a.name || '').localeCompare(String(b.name || ''), 'ro');
  });
}

/** Resolve a calendar's display hex from color_mine (palette ID or legacy hex). */
function resolveCalendarHex(rawColorMine: unknown): string {
  if (typeof rawColorMine === 'string' && rawColorMine.length > 0) {
    if (isDentistColorId(rawColorMine)) {
      return getDentistColorHex(rawColorMine) ?? DEFAULT_COLOR_MINE;
    }
    return rawColorMine; // legacy hex passthrough
  }
  return DEFAULT_COLOR_MINE;
}

export async function getCalendarListForUser(auth: AuthContext): Promise<CalendarListPayload> {
  const { dbUserId, userId, tenantId, email } = auth;

  return getCached(calendarListCacheKey(dbUserId), 120, async () => {
    await getOrCreateDefaultCalendar(auth);
    const db = await getMongoDbOrThrow();
    const normalizedEmail = email.toLowerCase().trim();

    const [ownCalendarDocs, acceptedSharesAsRecipient] = await Promise.all([
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

    const sharedCalendarIds = acceptedSharesAsRecipient
      .map((share: any) => share.calendar_id)
      .filter((id: unknown): id is number => typeof id === 'number');

    const allRelevantCalendarIds = [...new Set([...ownCalendarIds, ...sharedCalendarIds])];

    const [sharedCalendarDocs, sentPendingShareDocs, allAcceptedSharesOnRelevantCalendars] = await Promise.all([
      sharedCalendarIds.length > 0
        ? db.collection('calendars').find({
            id: { $in: sharedCalendarIds },
            is_active: true,
            deleted_at: { $exists: false },
          }).toArray()
        : Promise.resolve([]),
      ownCalendarIds.length > 0
        ? db.collection('calendar_shares').find({
            calendar_id: { $in: ownCalendarIds },
            status: 'pending',
          }).sort({ created_at: -1 }).toArray()
        : Promise.resolve([]),
      allRelevantCalendarIds.length > 0
        ? db.collection('calendar_shares').find(
            { calendar_id: { $in: allRelevantCalendarIds }, status: 'accepted' },
            { projection: { calendar_id: 1, shared_with_user_id: 1, dentist_color: 1 } }
          ).toArray()
        : Promise.resolve([]),
    ]);

    // Build map: calendarId → list of taken palette IDs (from accepted shares' dentist_color)
    const takenRecipientColorsByCalendar = new Map<number, string[]>();
    for (const share of allAcceptedSharesOnRelevantCalendars) {
      const calId = share.calendar_id;
      if (typeof calId !== 'number') continue;
      if (!takenRecipientColorsByCalendar.has(calId)) takenRecipientColorsByCalendar.set(calId, []);
      if (isDentistColorId(share.dentist_color)) {
        takenRecipientColorsByCalendar.get(calId)!.push(share.dentist_color);
      }
    }

    const sharedCalendarMap = new Map<number, any>(
      sharedCalendarDocs
        .filter((calendar: any) => typeof calendar.id === 'number')
        .map((calendar: any) => [calendar.id, calendar])
    );

    const ownCalendars = sortCalendars(
      ownCalendarDocs.map((calendar: any) => {
        const ownerColorId = isDentistColorId(calendar.color_mine) ? calendar.color_mine : null;
        const takenColors = takenRecipientColorsByCalendar.get(calendar.id) ?? [];
        return {
          ...stripMongoId(calendar),
          isOwner: true,
          permissions: OWNER_CALENDAR_PERMISSIONS,
          shareId: null,
          // Resolved hex for calendar dot / appointment-modal color chip
          color_mine: resolveCalendarHex(calendar.color_mine),
          color_others: null,
          // Palette ID fields for settings color pickers
          ownerColorId,
          dentistColorId: null,
          takenColors,
        };
      })
    );

    const sharedCalendars = acceptedSharesAsRecipient
      .map((share: any) => {
        const calendar = sharedCalendarMap.get(share.calendar_id);
        if (!calendar) {
          return null;
        }
        const ownerColorId = isDentistColorId(calendar.color_mine) ? calendar.color_mine : null;
        const dentistColorId = isDentistColorId(share.dentist_color) ? share.dentist_color : null;
        // takenColors = owner's color + ALL accepted recipients' dentist_colors
        const recipientColors = takenRecipientColorsByCalendar.get(share.calendar_id) ?? [];
        const takenColors = [...(ownerColorId ? [ownerColorId] : []), ...recipientColors];
        return {
          ...stripMongoId(calendar),
          isOwner: false,
          permissions: normalizeCalendarPermissions(share.permissions),
          shareId: typeof share.id === 'number' ? share.id : null,
          sharedByName: typeof share.shared_by_name === 'string' ? share.shared_by_name : null,
          dentistDisplayName: typeof share.dentist_display_name === 'string' ? share.dentist_display_name : null,
          // Resolved hex — for shared calendar the viewer's own color is dentistColorId
          color_mine: resolveCalendarHex(dentistColorId || calendar.color_mine),
          color_others: null,
          // Palette ID fields
          ownerColorId,
          dentistColorId,
          takenColors,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), 'ro'));

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
}

export async function getPendingSharesForUser(auth: AuthContext): Promise<PendingShareListPayload> {
  const { dbUserId, email } = auth;
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

  return { pendingShares };
}
