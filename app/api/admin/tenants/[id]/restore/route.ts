import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logAdminAudit } from '@/lib/audit';

async function restoreTenantCascade(db: any, tenantId: ObjectId) {
  const nowIso = new Date().toISOString();

  const users = await db.collection('users').find({ tenant_id: tenantId }).toArray();
  for (const user of users) {
    if (!user.disabled_by_tenant) continue;
    const restoreStatus = user.pre_tenant_disable_status || 'active';
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: { status: restoreStatus, updated_at: nowIso },
        $unset: { pre_tenant_disable_status: '', disabled_by_tenant: '' },
      }
    );
  }

  const members = await db.collection('team_members').find({ tenant_id: tenantId }).toArray();
  for (const member of members) {
    if (!member.disabled_by_tenant) continue;
    const restoreStatus = member.pre_tenant_disable_status || 'active';
    await db.collection('team_members').updateOne(
      { _id: member._id },
      {
        $set: { status: restoreStatus, updated_at: nowIso },
        $unset: { pre_tenant_disable_status: '', disabled_by_tenant: '' },
      }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId: actorUserId, email: actorEmail } = await getSuperAdmin();
    if (!ObjectId.isValid(params.id)) return createErrorResponse('Invalid tenant id', 400);
    const tenantId = new ObjectId(params.id);

    const db = await getMongoDbOrThrow();
    const before = await db.collection('tenants').findOne({ _id: tenantId });
    if (!before) return createErrorResponse('Tenant not found', 404);
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) {
      return createErrorResponse('Reason is required for restore', 400);
    }

    const nowIso = new Date().toISOString();
    await db.collection('tenants').updateOne(
      { _id: tenantId },
      {
        $set: { status: 'active', updated_at: nowIso, status_reason: reason },
        $unset: { deleted_at: '', deleted_by: '', pre_tenant_disable_status: '' },
      }
    );
    await restoreTenantCascade(db, tenantId);
    const tenant = await db.collection('tenants').findOne({ _id: tenantId });

    await logAdminAudit({
      action: 'tenant.restore',
      actorUserId,
      actorEmail,
      targetType: 'tenant',
      targetId: tenantId,
      request,
      before: {
        status: before.status,
        deleted_at: before.deleted_at || null,
      },
      after: {
        status: tenant?.status || 'active',
        deleted_at: tenant?.deleted_at || null,
      },
      metadata: { reason },
    });

    return createSuccessResponse({ success: true, tenant });
  } catch (error) {
    return handleApiError(error, 'Failed to restore tenant');
  }
}
