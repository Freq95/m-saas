import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logAdminAudit } from '@/lib/audit';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getSuperAdmin();
    if (!ObjectId.isValid(params.id)) return createErrorResponse('Invalid user id', 400);
    const userId = new ObjectId(params.id);

    const db = await getMongoDbOrThrow();
    const user = await db.collection('users').findOne({ _id: userId });
    if (!user) return createErrorResponse('User not found', 404);

    const [tenant, memberships] = await Promise.all([
      user.tenant_id ? db.collection('tenants').findOne({ _id: user.tenant_id }) : null,
      db.collection('team_members').find({ user_id: userId }).toArray(),
    ]);

    return createSuccessResponse({ user, tenant, memberships });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch user');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId: actorUserId, email: actorEmail } = await getSuperAdmin();
    if (!ObjectId.isValid(params.id)) return createErrorResponse('Invalid user id', 400);
    const userId = new ObjectId(params.id);
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (typeof body?.name === 'string' && body.name.trim()) updates.name = body.name.trim();
    if (typeof body?.role === 'string' && ['super_admin', 'owner', 'admin', 'staff', 'viewer'].includes(body.role)) {
      updates.role = body.role;
    }
    if (typeof body?.status === 'string' && ['active', 'pending_invite', 'suspended', 'deleted'].includes(body.status)) {
      updates.status = body.status;
      if (body.status === 'active') {
        updates.deleted_at = null;
        updates.deleted_by = null;
      }
    }
    if (Object.keys(updates).length === 0) return createErrorResponse('No valid fields to update', 400);

    updates.updated_at = new Date().toISOString();
    const db = await getMongoDbOrThrow();
    const before = await db.collection('users').findOne({ _id: userId });
    if (!before) return createErrorResponse('User not found', 404);

    await db.collection('users').updateOne({ _id: userId }, { $set: updates });
    const user = await db.collection('users').findOne({ _id: userId });

    await logAdminAudit({
      action: updates.status === 'active' && before?.deleted_at ? 'user.restore' : 'user.update',
      actorUserId,
      actorEmail,
      targetType: 'user',
      targetId: userId,
      request,
      before: {
        name: before.name,
        role: before.role,
        status: before.status,
        deleted_at: before.deleted_at || null,
      },
      after: user
        ? {
            name: user.name,
            role: user.role,
            status: user.status,
            deleted_at: user.deleted_at || null,
          }
        : null,
    });

    return createSuccessResponse({ user });
  } catch (error) {
    return handleApiError(error, 'Failed to update user');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId: actorUserId, email: actorEmail } = await getSuperAdmin();
    if (!ObjectId.isValid(params.id)) return createErrorResponse('Invalid user id', 400);
    const userId = new ObjectId(params.id);

    const db = await getMongoDbOrThrow();
    const before = await db.collection('users').findOne({ _id: userId });
    if (!before) return createErrorResponse('User not found', 404);

    const nowIso = new Date().toISOString();
    await db.collection('users').updateOne(
      { _id: userId },
      {
        $set: {
          status: 'deleted',
          deleted_at: nowIso,
          deleted_by: actorUserId,
          updated_at: nowIso,
        },
      }
    );
    const user = await db.collection('users').findOne({ _id: userId });

    await logAdminAudit({
      action: 'user.soft_delete',
      actorUserId,
      actorEmail,
      targetType: 'user',
      targetId: userId,
      request,
      before: {
        status: before.status,
        deleted_at: before.deleted_at || null,
      },
      after: {
        status: user?.status || 'deleted',
        deleted_at: user?.deleted_at || nowIso,
      },
    });

    return createSuccessResponse({ success: true, user });
  } catch (error) {
    return handleApiError(error, 'Failed to delete user');
  }
}
