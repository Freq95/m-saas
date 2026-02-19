import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { createInviteToken, sendInviteEmail } from '@/lib/invite';
import { logAdminAudit } from '@/lib/audit';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId: adminId, email: actorEmail } = await getSuperAdmin();
    if (!ObjectId.isValid(params.id)) return createErrorResponse('Invalid tenant id', 400);
    const tenantId = new ObjectId(params.id);
    const body = await request.json();
    const userIdParam = typeof body?.userId === 'string' ? body.userId : '';
    if (!ObjectId.isValid(userIdParam)) return createErrorResponse('Invalid userId', 400);
    const userId = new ObjectId(userIdParam);

    const db = await getMongoDbOrThrow();
    const [tenant, user] = await Promise.all([
      db.collection('tenants').findOne({ _id: tenantId }),
      db.collection('users').findOne({ _id: userId, tenant_id: tenantId }),
    ]);

    if (!tenant || !user) return createErrorResponse('Tenant or user not found', 404);
    if (tenant.status !== 'active') {
      return createErrorResponse(`Cannot resend invite for tenant with status ${tenant.status}`, 409);
    }
    if (user.status !== 'pending_invite') return createErrorResponse('User is not pending invite', 400);

    const token = await createInviteToken(user.email, userId, tenantId, user.role || 'staff', adminId);
    const inviteEmail = await sendInviteEmail(user.email, user.name || 'Utilizator', tenant.name, token);

    await logAdminAudit({
      action: 'tenant.invite.resend',
      actorUserId: adminId,
      actorEmail,
      targetType: 'user',
      targetId: userId,
      request,
      metadata: {
        tenant_id: String(tenantId),
        email: user.email,
        role: user.role || 'staff',
        invite_sent: inviteEmail.ok,
        invite_reason: inviteEmail.ok ? 'sent' : inviteEmail.reason,
      },
    });

    return createSuccessResponse({
      success: true,
      inviteToken: token,
      inviteEmail: {
        requested: true,
        sent: inviteEmail.ok,
        reason: inviteEmail.ok ? 'sent' : inviteEmail.reason,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to resend invite');
  }
}
