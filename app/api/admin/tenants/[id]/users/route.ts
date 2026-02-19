import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { createInviteToken, sendInviteEmail } from '@/lib/invite';
import { logAdminAudit } from '@/lib/audit';

async function getNextUserId(db: any): Promise<number> {
  const latest = await db.collection('users').find({ id: { $type: 'number' } }).sort({ id: -1 }).limit(1).next();
  return (latest?.id || 0) + 1;
}

function parseTenantId(id: string): ObjectId | null {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
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
    const members = await db.collection('team_members').find({ tenant_id: tenantId }).toArray();
    const userIds = members.map((member: any) => member.user_id).filter(Boolean);
    const users = userIds.length
      ? await db.collection('users').find({ _id: { $in: userIds } }).toArray()
      : [];
    const userMap = new Map<string, any>(users.map((user: any) => [String(user._id), user]));

    return createSuccessResponse({
      users: members.map((member: any) => {
        const user = userMap.get(String(member.user_id));
        return {
          ...member,
          email: user?.email || null,
          name: user?.name || null,
          user_status: user?.status || null,
        };
      }),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to list tenant users');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId: adminId, email: actorEmail } = await getSuperAdmin();
    const tenantId = parseTenantId(params.id);
    if (!tenantId) return createErrorResponse('Invalid tenant id', 400);

    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const role = ['owner', 'admin', 'staff', 'viewer'].includes(body?.role) ? body.role : 'staff';
    const sendInvite = body?.sendInvite !== false;

    if (!email || !name) return createErrorResponse('email and name are required', 400);

    const db = await getMongoDbOrThrow();
    const tenant = await db.collection('tenants').findOne({ _id: tenantId });
    if (!tenant) return createErrorResponse('Tenant not found', 404);
    if (tenant.status !== 'active') {
      return createErrorResponse(`Cannot add users to tenant with status ${tenant.status}`, 409);
    }

    const currentSeats = await db
      .collection('team_members')
      .countDocuments({ tenant_id: tenantId, status: { $in: ['active', 'pending_invite'] } });
    if (currentSeats >= (tenant.max_seats || 1)) {
      return createErrorResponse('Seat limit reached for this tenant', 409);
    }

    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) return createErrorResponse('User email already exists', 409);

    const nowIso = new Date().toISOString();
    const newUserId = new ObjectId();
    const userNumericId = await getNextUserId(db);

    await db.collection('users').insertOne({
      _id: newUserId,
      id: userNumericId,
      email,
      password_hash: null,
      name,
      role,
      tenant_id: tenantId,
      status: 'pending_invite',
      created_at: nowIso,
      updated_at: nowIso,
    });

    await db.collection('team_members').insertOne({
      _id: new ObjectId(),
      tenant_id: tenantId,
      user_id: newUserId,
      role,
      status: 'pending_invite',
      invited_at: nowIso,
      accepted_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    });

    const token = await createInviteToken(email, newUserId, tenantId, role, adminId);
    const inviteEmail = sendInvite
      ? await sendInviteEmail(email, name, tenant.name, token)
      : { ok: false as const, reason: 'not_requested' as const };

    await logAdminAudit({
      action: 'tenant.user.add',
      actorUserId: adminId,
      actorEmail,
      targetType: 'user',
      targetId: newUserId,
      request,
      after: {
        tenant_id: String(tenantId),
        email,
        role,
        status: 'pending_invite',
      },
      metadata: {
        invite_requested: sendInvite,
        invite_sent: inviteEmail.ok,
        invite_reason: inviteEmail.ok ? 'sent' : inviteEmail.reason,
      },
    });

    return createSuccessResponse(
      {
        userId: String(newUserId),
        inviteToken: token,
        inviteEmail: {
          requested: sendInvite,
          sent: inviteEmail.ok,
          reason: inviteEmail.ok ? 'sent' : inviteEmail.reason,
        },
      },
      201
    );
  } catch (error) {
    return handleApiError(error, 'Failed to add user');
  }
}
