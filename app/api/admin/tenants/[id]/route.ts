import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logAdminAudit } from '@/lib/audit';

function parseTenantId(id: string): ObjectId | null {
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getSuperAdmin();
    const tenantId = parseTenantId(params.id);
    if (!tenantId) return createErrorResponse('Invalid tenant id', 400);

    const db = await getMongoDbOrThrow();
    const tenant = await db.collection('tenants').findOne({ _id: tenantId });
    if (!tenant) return createErrorResponse('Tenant not found', 404);

    const [owner, members] = await Promise.all([
      tenant.owner_id ? db.collection('users').findOne({ _id: tenant.owner_id }) : null,
      db.collection('team_members').find({ tenant_id: tenantId }).toArray(),
    ]);

    const memberUserIds = members.map((member: any) => member.user_id).filter(Boolean);
    const users = memberUserIds.length
      ? await db.collection('users').find({ _id: { $in: memberUserIds } }).toArray()
      : [];
    const userMap = new Map<string, any>(users.map((user: any) => [String(user._id), user]));

    const enrichedMembers = members.map((member: any) => {
      const user = userMap.get(String(member.user_id));
      return {
        ...member,
        email: user?.email || null,
        name: user?.name || null,
      };
    });

    const seatUsage = enrichedMembers.filter((member: any) => ['active', 'pending_invite'].includes(member.status)).length;

    return createSuccessResponse({
      tenant,
      owner,
      members: enrichedMembers,
      seatUsage,
      maxSeats: tenant.max_seats || 1,
      atLimit: seatUsage >= (tenant.max_seats || 1),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch tenant');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId: actorUserId, email: actorEmail } = await getSuperAdmin();
    const tenantId = parseTenantId(params.id);
    if (!tenantId) return createErrorResponse('Invalid tenant id', 400);
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (typeof body?.name === 'string' && body.name.trim()) updates.name = body.name.trim();
    if (typeof body?.plan === 'string' && ['free', 'starter', 'pro'].includes(body.plan)) updates.plan = body.plan;
    if (typeof body?.status === 'string' && ['active', 'suspended', 'deleted'].includes(body.status)) {
      updates.status = body.status;
      if (body.status === 'active') {
        updates.deleted_at = null;
        updates.deleted_by = null;
      }
    }
    if (body?.maxSeats !== undefined) {
      const maxSeats = Math.max(1, Number.parseInt(String(body.maxSeats), 10) || 1);
      updates.max_seats = maxSeats;
    }
    if (Object.keys(updates).length === 0) return createErrorResponse('No valid fields to update', 400);

    updates.updated_at = new Date().toISOString();
    const db = await getMongoDbOrThrow();
    const before = await db.collection('tenants').findOne({ _id: tenantId });
    await db.collection('tenants').updateOne({ _id: tenantId }, { $set: updates });
    const tenant = await db.collection('tenants').findOne({ _id: tenantId });

    await logAdminAudit({
      action: updates.status === 'active' && before?.deleted_at ? 'tenant.restore' : 'tenant.update',
      actorUserId,
      actorEmail,
      targetType: 'tenant',
      targetId: tenantId,
      request,
      before: before
        ? {
            name: before.name,
            plan: before.plan,
            status: before.status,
            max_seats: before.max_seats,
          }
        : null,
      after: tenant
        ? {
            name: tenant.name,
            plan: tenant.plan,
            status: tenant.status,
            max_seats: tenant.max_seats,
          }
        : null,
    });
    return createSuccessResponse({ tenant });
  } catch (error) {
    return handleApiError(error, 'Failed to update tenant');
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId: actorUserId, email: actorEmail } = await getSuperAdmin();
    const tenantId = parseTenantId(params.id);
    if (!tenantId) return createErrorResponse('Invalid tenant id', 400);

    const db = await getMongoDbOrThrow();
    const before = await db.collection('tenants').findOne({ _id: tenantId });
    const nowIso = new Date().toISOString();
    await db.collection('tenants').updateOne(
      { _id: tenantId },
      {
        $set: {
          status: 'deleted',
          deleted_at: nowIso,
          deleted_by: actorUserId,
          updated_at: nowIso,
        },
      }
    );

    await logAdminAudit({
      action: 'tenant.soft_delete',
      actorUserId,
      actorEmail,
      targetType: 'tenant',
      targetId: tenantId,
      request: _request,
      before: before
        ? {
            name: before.name,
            status: before.status,
          }
        : null,
      after: {
        status: 'deleted',
        deleted_at: nowIso,
      },
    });

    return createSuccessResponse({ success: true, status: 'deleted' });
  } catch (error) {
    return handleApiError(error, 'Failed to delete tenant');
  }
}
