import { ObjectId } from 'mongodb';
import { AuthError, type AuthContext } from '@/lib/auth-helpers';
import {
  getCalendarAuth,
  getCalendarById,
  normalizeCalendarPermissions,
  type CalendarShareDoc,
} from '@/lib/calendar-auth';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

export interface BookableCalendarDentist {
  userId: number;
  dbUserId: ObjectId;
  tenantId: ObjectId;
  displayName: string;
  isOwner: boolean;
  isCurrentUser: boolean;
}

function toObjectId(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) {
    return value;
  }

  if (typeof value === 'string' && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }

  return null;
}

function uniqueObjectIds(values: Array<ObjectId | null | undefined>): ObjectId[] {
  const seen = new Set<string>();
  const result: ObjectId[] = [];

  for (const value of values) {
    if (!(value instanceof ObjectId)) {
      continue;
    }

    const key = value.toString();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

export async function getBookableDentistsForCalendar(
  authContext: AuthContext,
  calendarId: number
): Promise<BookableCalendarDentist[]> {
  await getCalendarAuth(authContext, calendarId);

  const calendar = await getCalendarById(calendarId);
  if (!calendar) {
    throw new AuthError('Calendar not found', 404);
  }

  const db = await getMongoDbOrThrow();
  const acceptedShares = await db.collection<CalendarShareDoc>('calendar_shares').find(
    {
      calendar_id: calendarId,
      status: 'accepted',
    },
    {
      projection: {
        shared_with_user_id: 1,
        shared_with_numeric_user_id: 1,
        shared_with_tenant_id: 1,
        shared_with_email: 1,
        permissions: 1,
        dentist_display_name: 1,
      },
    }
  ).toArray();

  const eligibleShares = acceptedShares.filter((share) => {
    const permissions = normalizeCalendarPermissions(share.permissions);
    return (
      permissions.can_create &&
      share.shared_with_user_id instanceof ObjectId &&
      typeof share.shared_with_numeric_user_id === 'number' &&
      share.shared_with_tenant_id instanceof ObjectId
    );
  });

  const userIds = uniqueObjectIds([
    toObjectId(calendar.owner_db_user_id),
    ...eligibleShares.map((share) => share.shared_with_user_id),
  ]);

  const userDocs = userIds.length > 0
    ? await db.collection('users').find(
        { _id: { $in: userIds } },
        {
          projection: {
            _id: 1,
            name: 1,
            email: 1,
          },
        }
      ).toArray()
    : [];

  const userByDbId = new Map<string, { name?: string; email?: string }>(
    userDocs.map((user) => [String(user._id), { name: user.name, email: user.email }])
  );

  const ownerDbUserId = toObjectId(calendar.owner_db_user_id);
  if (!ownerDbUserId) {
    throw new AuthError('Calendar owner is invalid', 500);
  }

  const ownerDisplayName =
    userByDbId.get(ownerDbUserId.toString())?.name?.trim() ||
    (ownerDbUserId.equals(authContext.dbUserId) ? authContext.name : '') ||
    userByDbId.get(ownerDbUserId.toString())?.email?.trim() ||
    'Medic';

  const dentists: BookableCalendarDentist[] = [
    {
      userId: calendar.owner_user_id,
      dbUserId: ownerDbUserId,
      tenantId: calendar.tenant_id,
      displayName: ownerDisplayName,
      isOwner: true,
      isCurrentUser: ownerDbUserId.equals(authContext.dbUserId),
    },
  ];

  for (const share of eligibleShares) {
    const sharedDbUserId = toObjectId(share.shared_with_user_id);
    const sharedTenantId = toObjectId(share.shared_with_tenant_id);
    if (!sharedDbUserId || !sharedTenantId || typeof share.shared_with_numeric_user_id !== 'number') {
      continue;
    }

    dentists.push({
      userId: share.shared_with_numeric_user_id,
      dbUserId: sharedDbUserId,
      tenantId: sharedTenantId,
      displayName:
        userByDbId.get(sharedDbUserId.toString())?.name?.trim() ||
        (typeof share.dentist_display_name === 'string' ? share.dentist_display_name.trim() : '') ||
        (typeof share.shared_with_email === 'string' ? share.shared_with_email : '') ||
        'Medic',
      isOwner: false,
      isCurrentUser: sharedDbUserId.equals(authContext.dbUserId),
    });
  }

  return dentists;
}

export async function resolveBookableDentistForCalendar(
  authContext: AuthContext,
  calendarId: number,
  dentistUserId?: number | null
): Promise<BookableCalendarDentist> {
  const dentists = await getBookableDentistsForCalendar(authContext, calendarId);

  const dentist = typeof dentistUserId === 'number'
    ? dentists.find((item) => item.userId === dentistUserId) || null
    : dentists.find((item) => item.isCurrentUser) || dentists[0] || null;

  if (!dentist) {
    throw new AuthError('Selected dentist is not available for the chosen calendar', 400);
  }

  return dentist;
}
