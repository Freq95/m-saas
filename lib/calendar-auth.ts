import { ObjectId } from 'mongodb';
import { AuthError, type AuthContext } from '@/lib/auth-helpers';
import { getMongoDbOrThrow, getNextNumericId, type FlexDoc } from '@/lib/db/mongo-utils';

export interface CalendarPermissions {
  can_view: boolean;
  can_create: boolean;
  can_edit_own: boolean;
  can_edit_all: boolean;
  can_delete_own: boolean;
  can_delete_all: boolean;
}

export interface CalendarDoc {
  _id: number;
  id: number;
  tenant_id: ObjectId;
  owner_user_id: number;
  owner_db_user_id: ObjectId;
  name: string;
  color_mine: string;
  color_others: string;
  is_default: boolean;
  is_active: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarShareDoc {
  _id: number;
  id: number;
  calendar_id: number;
  calendar_tenant_id: ObjectId;
  shared_with_user_id: ObjectId | null;
  shared_with_numeric_user_id: number | null;
  shared_with_email: string;
  shared_with_tenant_id: ObjectId | null;
  permissions?: Partial<CalendarPermissions> | null;
  dentist_display_name?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  invite_token_hash?: string | null;
  expires_at?: string | Date | null;
  shared_by_user_id: ObjectId;
  shared_by_name: string;
  created_at: string;
  updated_at: string;
  accepted_at?: string | null;
}

export interface CalendarAuthContext {
  calendarId: number;
  calendarTenantId: ObjectId;
  calendarOwnerId: number;
  calendarOwnerDbUserId: ObjectId | null;
  isOwner: boolean;
  permissions: CalendarPermissions;
  shareId: number | null;
}

const DEFAULT_PERSONAL_CALENDAR_NAME = 'Calendarul meu';
const DEFAULT_PERSONAL_CALENDAR_COLOR_MINE = '#2563EB';
const DEFAULT_PERSONAL_CALENDAR_COLOR_OTHERS = '#64748B';

export const OWNER_CALENDAR_PERMISSIONS: CalendarPermissions = {
  can_view: true,
  can_create: true,
  can_edit_own: true,
  can_edit_all: true,
  can_delete_own: true,
  can_delete_all: true,
};

function toObjectId(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) {
    return value;
  }
  if (typeof value === 'string' && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return null;
}

function objectIdEquals(value: unknown, expected: ObjectId): boolean {
  const normalized = toObjectId(value);
  return normalized ? normalized.equals(expected) : false;
}

export function normalizeCalendarPermissions(value: Partial<CalendarPermissions> | null | undefined): CalendarPermissions {
  return {
    can_view: true,
    can_create: Boolean(value?.can_create),
    can_edit_own: Boolean(value?.can_edit_own),
    can_edit_all: Boolean(value?.can_edit_all),
    can_delete_own: Boolean(value?.can_delete_own),
    can_delete_all: Boolean(value?.can_delete_all),
  };
}

export function isCalendarOwner(calendar: Pick<CalendarDoc, 'tenant_id' | 'owner_user_id' | 'owner_db_user_id'>, authContext: AuthContext): boolean {
  return (
    objectIdEquals(calendar.owner_db_user_id, authContext.dbUserId) ||
    (objectIdEquals(calendar.tenant_id, authContext.tenantId) && calendar.owner_user_id === authContext.userId)
  );
}

export async function getCalendarById(calendarId: number): Promise<CalendarDoc | null> {
  const db = await getMongoDbOrThrow();
  return db.collection<CalendarDoc>('calendars').findOne({
    id: calendarId,
    is_active: true,
    deleted_at: { $exists: false },
  });
}

export async function getOrCreateDefaultCalendar(authContext: AuthContext): Promise<CalendarDoc> {
  const db = await getMongoDbOrThrow();
  const existing = await db.collection<CalendarDoc>('calendars').findOne({
    tenant_id: authContext.tenantId,
    owner_user_id: authContext.userId,
    is_default: true,
    is_active: true,
    deleted_at: { $exists: false },
  });

  if (existing) {
    return existing;
  }

  const calendarId = await getNextNumericId('calendars');
  const now = new Date().toISOString();
  const calendarDoc: CalendarDoc = {
    _id: calendarId,
    id: calendarId,
    tenant_id: authContext.tenantId,
    owner_user_id: authContext.userId,
    owner_db_user_id: authContext.dbUserId,
    name: DEFAULT_PERSONAL_CALENDAR_NAME,
    color_mine: DEFAULT_PERSONAL_CALENDAR_COLOR_MINE,
    color_others: DEFAULT_PERSONAL_CALENDAR_COLOR_OTHERS,
    is_default: true,
    is_active: true,
    created_at: now,
    updated_at: now,
  };

  try {
    await db.collection<FlexDoc>('calendars').insertOne(calendarDoc as unknown as FlexDoc);
    return calendarDoc;
  } catch (error: any) {
    if (error?.code === 11000) {
      const duplicate = await db.collection<CalendarDoc>('calendars').findOne({
        tenant_id: authContext.tenantId,
        owner_user_id: authContext.userId,
        is_default: true,
        is_active: true,
        deleted_at: { $exists: false },
      });
      if (duplicate) {
        return duplicate;
      }
    }
    throw error;
  }
}

export async function getCalendarAuth(authContext: AuthContext, calendarId: number): Promise<CalendarAuthContext> {
  if (!Number.isInteger(calendarId) || calendarId <= 0) {
    throw new AuthError('Invalid calendar ID', 400);
  }

  const db = await getMongoDbOrThrow();
  const calendar = await getCalendarById(calendarId);
  if (!calendar) {
    throw new AuthError('Calendar not found', 404);
  }

  if (isCalendarOwner(calendar, authContext)) {
    return {
      calendarId: calendar.id,
      calendarTenantId: calendar.tenant_id,
      calendarOwnerId: calendar.owner_user_id,
      calendarOwnerDbUserId: toObjectId(calendar.owner_db_user_id),
      isOwner: true,
      permissions: OWNER_CALENDAR_PERMISSIONS,
      shareId: null,
    };
  }

  const normalizedEmail = authContext.email.toLowerCase().trim();
  const share = await db.collection<CalendarShareDoc>('calendar_shares').findOne({
    calendar_id: calendar.id,
    status: 'accepted',
    $or: normalizedEmail
      ? [
          { shared_with_user_id: authContext.dbUserId },
          { shared_with_email: normalizedEmail },
        ]
      : [{ shared_with_user_id: authContext.dbUserId }],
  });

  if (!share) {
    throw new AuthError('Not authorized to access this calendar', 403);
  }

  return {
    calendarId: calendar.id,
    calendarTenantId: calendar.tenant_id,
    calendarOwnerId: calendar.owner_user_id,
    calendarOwnerDbUserId: toObjectId(calendar.owner_db_user_id),
    isOwner: false,
    permissions: normalizeCalendarPermissions(share.permissions),
    shareId: typeof share.id === 'number' ? share.id : null,
  };
}

export function requireCalendarPermission(
  calendarAuth: CalendarAuthContext,
  permission: keyof CalendarPermissions
): void {
  if (!calendarAuth.permissions[permission]) {
    throw new AuthError('Not authorized to perform this action on the calendar', 403);
  }
}

function appointmentCreatorMatches(appointment: { created_by_user_id?: ObjectId | string | null }, currentDbUserId: ObjectId): boolean {
  const createdBy = toObjectId(appointment.created_by_user_id);
  return createdBy ? createdBy.equals(currentDbUserId) : false;
}

export function canEditAppointment(
  calendarAuth: CalendarAuthContext,
  appointment: { created_by_user_id?: ObjectId | string | null },
  currentDbUserId: ObjectId
): boolean {
  return calendarAuth.permissions.can_edit_all
    || (calendarAuth.permissions.can_edit_own && appointmentCreatorMatches(appointment, currentDbUserId));
}

export function canDeleteAppointment(
  calendarAuth: CalendarAuthContext,
  appointment: { created_by_user_id?: ObjectId | string | null },
  currentDbUserId: ObjectId
): boolean {
  return calendarAuth.permissions.can_delete_all
    || (calendarAuth.permissions.can_delete_own && appointmentCreatorMatches(appointment, currentDbUserId));
}
