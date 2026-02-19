import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logAdminAudit } from '@/lib/audit';

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

    await db.collection('tenants').updateOne(
      { _id: tenantId },
      {
        $set: { status: 'active', updated_at: new Date().toISOString() },
        $unset: { deleted_at: '', deleted_by: '' },
      }
    );
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
    });

    return createSuccessResponse({ success: true, tenant });
  } catch (error) {
    return handleApiError(error, 'Failed to restore tenant');
  }
}
