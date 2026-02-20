import { NextRequest } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { createInviteToken, sendInviteEmail } from '@/lib/invite';
import { getAuthUser } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  try {
    const { dbUserId, tenantId, role } = await getAuthUser();
    if (role !== 'owner') {
      return createErrorResponse('Only the clinic owner can invite team members', 403);
    }

    const body = await request.json();
    const email = String(body?.email || '').toLowerCase().trim();
    const name = String(body?.name || '').trim();
    if (!email || !name) {
      return createErrorResponse('Name and email are required', 400);
    }

    const db = await getMongoDbOrThrow();
    const tenant = await db.collection('tenants').findOne({ _id: tenantId });
    if (!tenant) {
      return createErrorResponse('Tenant not found', 404);
    }

    const activeMembers = await db.collection('team_members').countDocuments({
      tenant_id: tenantId,
      status: { $ne: 'removed' },
    });

    const maxSeats = Number(tenant.max_seats || 0);
    if (maxSeats <= 0) {
      return createErrorResponse(
        'Tenant has no seat allocation. Ask platform admin to set seat limit.',
        403
      );
    }
    if (activeMembers >= maxSeats) {
      return createErrorResponse(
        `Seat limit reached (${activeMembers}/${maxSeats}). Remove a member or ask platform admin to increase seat limit.`,
        403
      );
    }

    const existingMember = await db.collection('team_members').findOne({
      tenant_id: tenantId,
      email,
      status: { $ne: 'removed' },
    });
    if (existingMember) {
      return createErrorResponse('User is already a member of this tenant', 409);
    }

    const existingUser = await db.collection('users').findOne({ email, tenant_id: tenantId });
    if (existingUser && existingUser.status !== 'deleted') {
      return createErrorResponse('User with this email already exists in this tenant', 409);
    }

    const nowIso = new Date().toISOString();
    const userRole = 'staff';

    const userResult = existingUser
      ? { insertedId: existingUser._id }
      : await db.collection('users').insertOne({
          email,
          password_hash: null,
          name,
          role: userRole,
          tenant_id: tenantId,
          status: 'pending_invite',
          created_at: nowIso,
          updated_at: nowIso,
        });

    await db.collection('team_members').insertOne({
      tenant_id: tenantId,
      user_id: userResult.insertedId,
      email,
      role: userRole,
      invited_by: dbUserId,
      invited_at: nowIso,
      accepted_at: null,
      status: 'pending',
      created_at: nowIso,
      updated_at: nowIso,
    });

    const token = await createInviteToken(email, userResult.insertedId, tenantId, userRole, dbUserId);
    await sendInviteEmail(email, name, (tenant as any).name || 'Clinic', token);

    return createSuccessResponse({ message: 'Invite sent' }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to invite team member');
  }
}
