import { ObjectId } from 'mongodb';
import type { AuthContext } from '@/lib/auth-helpers';
import { getCalendarAuth, type CalendarAuthContext } from '@/lib/calendar-auth';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId, type FlexDoc } from '@/lib/db/mongo-utils';

export interface AvailabilityBlockDoc {
  _id: number;
  id: number;
  tenant_id: ObjectId;
  calendar_id?: number | null;
  user_id: number;
  type_label: string;
  reason: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  created_by_user_id: ObjectId;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: ObjectId | null;
}

export type AvailabilityBlockPayload = Omit<AvailabilityBlockDoc, '_id' | 'tenant_id' | 'created_by_user_id' | 'deleted_by'> & {
  created_by_user_id: string;
  visible_calendar_ids?: number[];
  can_edit?: boolean;
  can_delete?: boolean;
};

function normalizeDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

function ensureValidRange(start: Date, end: Date) {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new Error('INVALID_TIME_RANGE');
  }
}

function isDentistActor(auth: AuthContext) {
  return auth.role === 'owner' || auth.role === 'dentist';
}

function canMutateBlock(auth: AuthContext, block: Pick<AvailabilityBlockDoc, 'created_by_user_id' | 'user_id'>) {
  return isDentistActor(auth)
    && block.user_id === auth.userId
    && block.created_by_user_id.equals(auth.dbUserId);
}

export async function getAuthorizedCalendarIds(auth: AuthContext, requestedCalendarIds?: number[]) {
  const ids = Array.from(new Set((requestedCalendarIds || []).filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return [];

  const contexts: CalendarAuthContext[] = [];
  for (const id of ids) {
    contexts.push(await getCalendarAuth(auth, id));
  }
  return contexts;
}

export async function listAvailabilityBlocks(params: {
  auth: AuthContext;
  calendarIds: number[];
  startTime: Date;
  endTime: Date;
}): Promise<AvailabilityBlockPayload[]> {
  const calendarAuths = await getAuthorizedCalendarIds(params.auth, params.calendarIds);
  const authorizedIds = calendarAuths.map((ctx) => ctx.calendarId);
  if (authorizedIds.length === 0) return [];

  const db = await getMongoDbOrThrow();
  const calendars = await db.collection('calendars').find(
    {
      id: { $in: authorizedIds },
      is_active: true,
      deleted_at: { $exists: false },
    },
    { projection: { id: 1, owner_user_id: 1 } }
  ).toArray();
  const shares = await db.collection('calendar_shares').find(
    {
      calendar_id: { $in: authorizedIds },
      status: 'accepted',
      shared_with_numeric_user_id: { $type: 'number' },
    },
    { projection: { calendar_id: 1, shared_with_numeric_user_id: 1 } }
  ).toArray();

  const visibleUserIdsByCalendarId = new Map<number, Set<number>>();
  for (const calendar of calendars) {
    if (typeof calendar.id !== 'number' || typeof calendar.owner_user_id !== 'number') continue;
    if (!visibleUserIdsByCalendarId.has(calendar.id)) visibleUserIdsByCalendarId.set(calendar.id, new Set());
    visibleUserIdsByCalendarId.get(calendar.id)!.add(calendar.owner_user_id);
  }
  for (const share of shares) {
    if (typeof share.calendar_id !== 'number' || typeof share.shared_with_numeric_user_id !== 'number') continue;
    if (!visibleUserIdsByCalendarId.has(share.calendar_id)) visibleUserIdsByCalendarId.set(share.calendar_id, new Set());
    visibleUserIdsByCalendarId.get(share.calendar_id)!.add(share.shared_with_numeric_user_id);
  }

  const targetUserIds = Array.from(
    new Set(
      Array.from(visibleUserIdsByCalendarId.values()).flatMap((ids) => Array.from(ids))
    )
  );
  if (targetUserIds.length === 0) return [];

  const docs = await db.collection<AvailabilityBlockDoc>('availability_blocks').find({
    user_id: { $in: targetUserIds },
    deleted_at: { $exists: false },
    start_time: { $lt: params.endTime.toISOString() },
    end_time: { $gt: params.startTime.toISOString() },
  }).sort({ start_time: 1 }).toArray();

  return docs.map((doc) => {
    const visibleCalendarIds = Array.from(visibleUserIdsByCalendarId.entries())
      .filter(([, userIds]) => userIds.has(doc.user_id))
      .map(([calendarId]) => calendarId);
    return {
      ...(stripMongoId(doc as unknown as Record<string, unknown>) as Omit<AvailabilityBlockDoc, '_id' | 'tenant_id' | 'created_by_user_id' | 'deleted_by'>),
      created_by_user_id: doc.created_by_user_id.toString(),
      visible_calendar_ids: visibleCalendarIds,
      can_edit: canMutateBlock(params.auth, doc),
      can_delete: canMutateBlock(params.auth, doc),
    };
  });
}

export async function findAvailabilityBlockConflicts(params: {
  tenantId: ObjectId;
  dentistUserId: number;
  startTime: Date;
  endTime: Date;
  excludeBlockId?: number;
}) {
  const db = await getMongoDbOrThrow();
  return db.collection<AvailabilityBlockDoc>('availability_blocks').find({
    tenant_id: params.tenantId,
    user_id: params.dentistUserId,
    deleted_at: { $exists: false },
    start_time: { $lt: params.endTime.toISOString() },
    end_time: { $gt: params.startTime.toISOString() },
    ...(params.excludeBlockId ? { id: { $ne: params.excludeBlockId } } : {}),
  }).sort({ start_time: 1 }).toArray();
}

export async function findAppointmentsOverlappingBlock(params: {
  tenantId: ObjectId;
  dentistUserId: number;
  startTime: Date;
  endTime: Date;
}) {
  const db = await getMongoDbOrThrow();
  return db.collection('appointments').find({
    tenant_id: params.tenantId,
    $or: [
      { dentist_id: params.dentistUserId },
      { service_owner_user_id: params.dentistUserId },
      { user_id: params.dentistUserId },
    ],
    deleted_at: { $exists: false },
    status: 'scheduled',
    start_time: { $lt: params.endTime.toISOString() },
    end_time: { $gt: params.startTime.toISOString() },
  }, {
    projection: {
      id: 1,
      client_name: 1,
      service_name: 1,
      start_time: 1,
      end_time: 1,
    },
  }).sort({ start_time: 1 }).toArray();
}

export async function createAvailabilityBlock(params: {
  auth: AuthContext;
  typeLabel: string;
  reason?: string | null;
  startTime: string | Date;
  endTime: string | Date;
  allDay?: boolean;
}) {
  if (!isDentistActor(params.auth)) {
    throw new Error('FORBIDDEN_CREATE');
  }

  const start = normalizeDate(params.startTime);
  const end = normalizeDate(params.endTime);
  ensureValidRange(start, end);

  const db = await getMongoDbOrThrow();
  const id = await getNextNumericId('availability_blocks');
  const now = new Date().toISOString();
  const doc: AvailabilityBlockDoc = {
    _id: id,
    id,
    tenant_id: params.auth.tenantId,
    calendar_id: null,
    user_id: params.auth.userId,
    type_label: params.typeLabel.trim(),
    reason: params.reason?.trim() || null,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    all_day: Boolean(params.allDay),
    created_by_user_id: params.auth.dbUserId,
    created_at: now,
    updated_at: now,
  };

  await db.collection<FlexDoc>('availability_blocks').insertOne(doc as unknown as FlexDoc);
  const overlappingAppointments = await findAppointmentsOverlappingBlock({
    tenantId: params.auth.tenantId,
    dentistUserId: params.auth.userId,
    startTime: start,
    endTime: end,
  });

  return {
    block: {
      ...(stripMongoId(doc as unknown as Record<string, unknown>) as Omit<AvailabilityBlockDoc, '_id' | 'tenant_id' | 'created_by_user_id' | 'deleted_by'>),
      created_by_user_id: doc.created_by_user_id.toString(),
      can_edit: true,
      can_delete: true,
    },
    overlappingAppointments: overlappingAppointments.map((appointment) => stripMongoId(appointment as unknown as Record<string, unknown>)),
  };
}

export async function updateAvailabilityBlock(params: {
  auth: AuthContext;
  blockId: number;
  patch: {
    typeLabel?: string;
    reason?: string | null;
    startTime?: string | Date;
    endTime?: string | Date;
    allDay?: boolean;
  };
}) {
  const db = await getMongoDbOrThrow();
  const existing = await db.collection<AvailabilityBlockDoc>('availability_blocks').findOne({
    id: params.blockId,
    deleted_at: { $exists: false },
  });
  if (!existing) throw new Error('NOT_FOUND');

  if (!canMutateBlock(params.auth, existing)) {
    throw new Error('FORBIDDEN_EDIT');
  }

  const start = params.patch.startTime !== undefined ? normalizeDate(params.patch.startTime) : new Date(existing.start_time);
  const end = params.patch.endTime !== undefined ? normalizeDate(params.patch.endTime) : new Date(existing.end_time);
  ensureValidRange(start, end);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (params.patch.typeLabel !== undefined) updates.type_label = params.patch.typeLabel.trim();
  if (params.patch.reason !== undefined) updates.reason = params.patch.reason?.trim() || null;
  if (params.patch.startTime !== undefined) updates.start_time = start.toISOString();
  if (params.patch.endTime !== undefined) updates.end_time = end.toISOString();
  if (params.patch.allDay !== undefined) updates.all_day = Boolean(params.patch.allDay);

  const result = await db.collection<AvailabilityBlockDoc>('availability_blocks').findOneAndUpdate(
    { id: params.blockId, deleted_at: { $exists: false } },
    { $set: updates },
    { returnDocument: 'after' }
  );
  if (!result) throw new Error('NOT_FOUND');

  const overlappingAppointments = await findAppointmentsOverlappingBlock({
    tenantId: result.tenant_id,
    dentistUserId: result.user_id,
    startTime: new Date(result.start_time),
    endTime: new Date(result.end_time),
  });

  return {
    block: {
      ...(stripMongoId(result) as Omit<AvailabilityBlockDoc, '_id' | 'tenant_id' | 'created_by_user_id' | 'deleted_by'>),
      created_by_user_id: result.created_by_user_id.toString(),
      can_edit: true,
      can_delete: canMutateBlock(params.auth, result),
    },
    overlappingAppointments: overlappingAppointments.map(stripMongoId),
  };
}

export async function deleteAvailabilityBlock(params: { auth: AuthContext; blockId: number }) {
  const db = await getMongoDbOrThrow();
  const existing = await db.collection<AvailabilityBlockDoc>('availability_blocks').findOne({
    id: params.blockId,
    deleted_at: { $exists: false },
  });
  if (!existing) throw new Error('NOT_FOUND');
  if (!canMutateBlock(params.auth, existing)) {
    throw new Error('FORBIDDEN_DELETE');
  }

  await db.collection('availability_blocks').updateOne(
    { id: params.blockId, deleted_at: { $exists: false } },
    {
      $set: {
        deleted_at: new Date().toISOString(),
        deleted_by: params.auth.dbUserId,
        updated_at: new Date().toISOString(),
      },
    }
  );
}
