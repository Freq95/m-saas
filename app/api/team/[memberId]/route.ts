import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { checkUpdateRateLimit } from '@/lib/rate-limit';
import { invalidateReadCaches } from '@/lib/cache-keys';
import { logAdminAudit } from '@/lib/audit';

const TEAM_ROLES = ['dentist', 'receptionist', 'asistent'] as const;

function normalizeAssignedDentistIds(value: unknown): number[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((id): id is number => (
    typeof id === 'number' && Number.isInteger(id) && id > 0
  ))));
}

async function findLinkedAsistents(db: any, tenantId: ObjectId, dentistNumericUserId: number) {
  return db.collection('team_members').find({
    tenant_id: tenantId,
    role: 'asistent',
    status: { $ne: 'removed' },
    assigned_dentist_user_ids: dentistNumericUserId,
  }).toArray();
}

async function validateAssignedDentists(db: any, tenantId: ObjectId, ids: number[]): Promise<boolean> {
  if (ids.length === 0) return true;
  const count = await db.collection('users').countDocuments({
    tenant_id: tenantId,
    id: { $in: ids },
    role: { $in: ['owner', 'dentist'] },
    status: { $ne: 'deleted' },
  });
  return count === ids.length;
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  try {
    const auth = await getAuthUser();
    const { userId, dbUserId, tenantId, role } = auth;
    if (role !== 'owner') {
      return createErrorResponse('Only clinic owner can update team members', 403);
    }
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;

    if (!ObjectId.isValid(params.memberId)) {
      return createErrorResponse('Invalid memberId', 400);
    }

    const memberUserId = new ObjectId(params.memberId);
    const body = await request.json();
    const nextRole = typeof body?.role === 'string' ? body.role : undefined;
    const nextAssignments = normalizeAssignedDentistIds(body?.assigned_dentist_user_ids);

    if (nextRole !== undefined && !TEAM_ROLES.includes(nextRole as any)) {
      return createErrorResponse('Invalid role', 400);
    }

    const db = await getMongoDbOrThrow();
    const [member, user] = await Promise.all([
      db.collection('team_members').findOne({ tenant_id: tenantId, user_id: memberUserId, status: { $ne: 'removed' } }),
      db.collection('users').findOne({ _id: memberUserId, tenant_id: tenantId, status: { $ne: 'deleted' } }),
    ]);
    if (!member || !user) {
      return createErrorResponse('Member not found', 404);
    }
    if (user.role === 'owner' || member.role === 'owner' || String(memberUserId) === String(dbUserId)) {
      return createErrorResponse('Owner role cannot be changed in-app', 403);
    }

    const currentRole = String(user.role || member.role || 'dentist');
    const effectiveRole = nextRole ?? currentRole;
    const currentAssignments = Array.isArray(member.assigned_dentist_user_ids)
      ? member.assigned_dentist_user_ids.filter((id: unknown): id is number => typeof id === 'number' && id > 0)
      : [];

    if (typeof user.id !== 'number') {
      return createErrorResponse('Member is missing numeric user id', 409);
    }

    if (currentRole === 'dentist' && effectiveRole !== 'dentist') {
      const linkedAsistents = await findLinkedAsistents(db, tenantId, user.id);
      if (linkedAsistents.length > 0) {
        return createErrorResponse('Asistenti sunt asignati acestui medic. Dezleaga-i intai.', 409);
      }
    }

    if (currentRole === 'asistent' && effectiveRole !== 'asistent' && currentAssignments.length > 0) {
      return createErrorResponse('Acest asistent este inca asignat. Dezleaga-l intai.', 409);
    }

    if (effectiveRole === 'asistent' && nextAssignments !== null) {
      const valid = await validateAssignedDentists(db, tenantId, nextAssignments);
      if (!valid) {
        return createErrorResponse('One or more assigned dentists are invalid', 400);
      }
    }

    const nowIso = new Date().toISOString();
    const userUpdates: Record<string, unknown> = { updated_at: nowIso };
    const memberUpdates: Record<string, unknown> = { updated_at: nowIso };
    if (nextRole !== undefined && nextRole !== currentRole) {
      userUpdates.role = nextRole;
      memberUpdates.role = nextRole;
    }
    if (effectiveRole === 'asistent') {
      if (nextAssignments !== null) {
        memberUpdates.assigned_dentist_user_ids = nextAssignments;
      }
    } else {
      memberUpdates.assigned_dentist_user_ids = [];
    }

    await db.collection('users').updateOne(
      { _id: memberUserId, tenant_id: tenantId },
      { $set: userUpdates, $inc: { session_version: 1 } }
    );
    await db.collection('team_members').updateOne(
      { tenant_id: tenantId, user_id: memberUserId },
      { $set: memberUpdates }
    );

    const afterAssignments = effectiveRole === 'asistent'
      ? (nextAssignments !== null ? nextAssignments : currentAssignments)
      : [];
    if (nextRole !== undefined && nextRole !== currentRole) {
      await logAdminAudit({
        action: 'team.role_change',
        actorUserId: dbUserId,
        actorEmail: auth.email,
        targetType: 'user',
        targetId: memberUserId,
        request,
        before: { role: currentRole },
        after: { role: effectiveRole },
      });
    }
    if (nextAssignments !== null && JSON.stringify(currentAssignments) !== JSON.stringify(afterAssignments)) {
      await logAdminAudit({
        action: 'team.asistent_assignment',
        actorUserId: dbUserId,
        actorEmail: auth.email,
        targetType: 'user',
        targetId: memberUserId,
        request,
        before: { assigned_dentist_user_ids: currentAssignments },
        after: { assigned_dentist_user_ids: afterAssignments },
      });
    }

    await invalidateReadCaches({
      tenantId,
      userId,
      viewerDbUserId: dbUserId,
      additionalViewerDbUserIds: [memberUserId],
    });

    return createSuccessResponse({ success: true });
  } catch (error: any) {
    if (error?.code === 11000) {
      return createErrorResponse('Owner already exists for this tenant; transfer is required.', 409);
    }
    return handleApiError(error, 'Failed to update team member');
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ memberId: string }> }) {
  const params = await props.params;
  try {
    const { userId, dbUserId, tenantId, role } = await getAuthUser();
    if (role !== 'owner') {
      return createErrorResponse('Only clinic owner can remove team members', 403);
    }
    const limited = await checkUpdateRateLimit(userId);
    if (limited) return limited;

    if (!ObjectId.isValid(params.memberId)) {
      return createErrorResponse('Invalid memberId', 400);
    }

    const memberUserId = new ObjectId(params.memberId);
    if (String(memberUserId) === String(dbUserId)) {
      return createErrorResponse('Owner cannot remove self', 400);
    }

    const db = await getMongoDbOrThrow();
    const [member, user] = await Promise.all([
      db.collection('team_members').findOne({ tenant_id: tenantId, user_id: memberUserId }),
      db.collection('users').findOne({ _id: memberUserId, tenant_id: tenantId }),
    ]);
    if (!member) {
      return createErrorResponse('Member not found', 404);
    }
    if (member.role === 'owner') {
      return createErrorResponse('Owner cannot be removed', 400);
    }
    if (member.role === 'asistent' && Array.isArray(member.assigned_dentist_user_ids) && member.assigned_dentist_user_ids.length > 0) {
      return createErrorResponse('Acest asistent este inca asignat. Dezleaga-l intai.', 409);
    }
    if (user?.role === 'dentist' && typeof user.id === 'number') {
      const linkedAsistents = await findLinkedAsistents(db, tenantId, user.id);
      if (linkedAsistents.length > 0) {
        return createErrorResponse('Asistenti sunt asignati acestui medic. Dezleaga-i intai.', 409);
      }
    }

    const nowIso = new Date().toISOString();
    await db.collection('team_members').updateOne(
      { tenant_id: tenantId, user_id: memberUserId },
      { $set: { status: 'removed', updated_at: nowIso } }
    );
    await db.collection('users').updateOne(
      { _id: memberUserId, tenant_id: tenantId },
      {
        $set: { status: 'deleted', updated_at: nowIso },
        $inc: { session_version: 1 },
      }
    );

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to remove team member');
  }
}
