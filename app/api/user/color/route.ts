import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getAuthUser, type AuthContext } from '@/lib/auth-helpers';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import {
  DENTIST_COLOR_PALETTE,
  isDentistColorId,
  type DentistColorId,
} from '@/lib/calendar-color-policy';

const updateColorSchema = z
  .object({
    color: z.string().refine(isDentistColorId, 'Color must be one of the palette ids.'),
  })
  .strict();

/**
 * Returns the set of color IDs already taken by *other* dentists who share a
 * calendar with the current user (in either direction). The current user's
 * own color is excluded from this set.
 *
 * "Connected" dentists = the union of:
 *   - users who own a calendar shared with me (any status accepted)
 *   - users who have an accepted share to one of my calendars
 */
async function getConnectedDentistColors(auth: AuthContext): Promise<Set<DentistColorId>> {
  const db = await getMongoDbOrThrow();

  // Calendars I OWN — get accepted recipients
  const myCalendars = await db
    .collection('calendars')
    .find({ owner_db_user_id: auth.dbUserId, is_active: true, deleted_at: { $exists: false } })
    .project<{ id: number }>({ id: 1 })
    .toArray();
  const myCalendarIds = myCalendars.map((c) => c.id).filter((v) => typeof v === 'number');

  const sharesToMyCalendars = myCalendarIds.length > 0
    ? await db
        .collection('calendar_shares')
        .find({
          calendar_id: { $in: myCalendarIds },
          status: 'accepted',
          shared_with_user_id: { $type: 'objectId' },
        })
        .project<{ shared_with_user_id: ObjectId }>({ shared_with_user_id: 1 })
        .toArray()
    : [];

  // Shares accepted by ME — get the calendar OWNERS
  const mySharedAcceptances = await db
    .collection('calendar_shares')
    .find({
      shared_with_user_id: auth.dbUserId,
      status: 'accepted',
    })
    .project<{ calendar_id: number }>({ calendar_id: 1 })
    .toArray();
  const ownerCalendarIds = mySharedAcceptances.map((s) => s.calendar_id).filter((v) => typeof v === 'number');

  const ownersOfCalendarsSharedWithMe = ownerCalendarIds.length > 0
    ? await db
        .collection('calendars')
        .find({ id: { $in: ownerCalendarIds } })
        .project<{ owner_db_user_id: ObjectId }>({ owner_db_user_id: 1 })
        .toArray()
    : [];

  // Build the set of "other dentist" db user ids
  const otherIds = new Set<string>();
  for (const share of sharesToMyCalendars) {
    if (share.shared_with_user_id && !share.shared_with_user_id.equals(auth.dbUserId)) {
      otherIds.add(share.shared_with_user_id.toString());
    }
  }
  for (const cal of ownersOfCalendarsSharedWithMe) {
    if (cal.owner_db_user_id && !cal.owner_db_user_id.equals(auth.dbUserId)) {
      otherIds.add(cal.owner_db_user_id.toString());
    }
  }

  if (otherIds.size === 0) return new Set();

  const otherUserIds = Array.from(otherIds).map((s) => new ObjectId(s));
  const users = await db
    .collection('users')
    .find({ _id: { $in: otherUserIds } })
    .project<{ color?: string }>({ color: 1 })
    .toArray();

  const taken = new Set<DentistColorId>();
  for (const u of users) {
    if (typeof u.color === 'string' && isDentistColorId(u.color)) {
      taken.add(u.color);
    }
  }
  return taken;
}

export async function GET() {
  try {
    const auth = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const me = await db.collection('users').findOne(
      { _id: auth.dbUserId },
      { projection: { color: 1 } }
    );
    const myColor = isDentistColorId(me?.color) ? me!.color as DentistColorId : null;
    const taken = await getConnectedDentistColors(auth);
    return createSuccessResponse({
      color: myColor,
      palette: DENTIST_COLOR_PALETTE,
      takenByOthers: Array.from(taken),
    });
  } catch (error) {
    return handleApiError(error, 'Nu am putut incarca culoarea.');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const limited = await checkUpdateRateLimit(auth.userId);
    if (limited) return limited;

    const body = await request.json();
    const parsed = updateColorSchema.safeParse(body);
    if (!parsed.success) {
      return createErrorResponse(parsed.error.errors[0]?.message || 'Culoare invalida.', 400);
    }
    const { color } = parsed.data;

    const taken = await getConnectedDentistColors(auth);
    if (taken.has(color as DentistColorId)) {
      return createErrorResponse('Aceasta culoare este deja folosita de un alt medic cu care impartasesti un calendar.', 409);
    }

    const db = await getMongoDbOrThrow();
    await db.collection('users').updateOne(
      { _id: auth.dbUserId },
      { $set: { color, updated_at: new Date().toISOString() } }
    );

    return createSuccessResponse({ success: true, color });
  } catch (error) {
    return handleApiError(error, 'Nu am putut salva culoarea.');
  }
}
