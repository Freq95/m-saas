import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { markInviteUsed, validateInviteToken } from '@/lib/invite';

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const invite = await validateInviteToken(params.token);
    if (!invite) return createErrorResponse('Invalid or expired invite', 404);

    const db = await getMongoDbOrThrow();
    const [user, tenant] = await Promise.all([
      db.collection('users').findOne({ _id: invite.user_id }),
      db.collection('tenants').findOne({ _id: invite.tenant_id }),
    ]);

    return createSuccessResponse({
      email: invite.email,
      name: user?.name || '',
      tenantName: tenant?.name || '',
      role: invite.role,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to validate invite');
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const body = await request.json();
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!password || password.length < 8) {
      return createErrorResponse('Password must be at least 8 characters', 400);
    }

    const invite = await validateInviteToken(params.token);
    if (!invite) return createErrorResponse('Invalid or expired invite', 404);

    const db = await getMongoDbOrThrow();
    const [tenant, existingMember] = await Promise.all([
      db.collection('tenants').findOne({ _id: invite.tenant_id }),
      db.collection('team_members').findOne({ user_id: invite.user_id, tenant_id: invite.tenant_id }),
    ]);
    if (!tenant || tenant.status !== 'active') {
      return createErrorResponse('Tenant is not active. Ask your administrator to reactivate the tenant and resend invite.', 409);
    }
    if (!existingMember) {
      return createErrorResponse('Invite membership is no longer valid. Ask your administrator to resend invite.', 409);
    }

    try {
      await markInviteUsed(params.token);
    } catch {
      return createErrorResponse('Invite already used or expired', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const nowIso = new Date().toISOString();

    const userUpdateResult = await db.collection('users').updateOne(
      { _id: invite.user_id },
      { $set: { password_hash: passwordHash, status: 'active', updated_at: nowIso } }
    );
    if (userUpdateResult.matchedCount === 0) {
      return createErrorResponse('User no longer exists for this invite. Ask your administrator to resend invite.', 409);
    }

    const memberUpdateResult = await db.collection('team_members').updateOne(
      { user_id: invite.user_id, tenant_id: invite.tenant_id },
      { $set: { status: 'active', accepted_at: nowIso, updated_at: nowIso } }
    );
    if (memberUpdateResult.modifiedCount === 0) {
      return createErrorResponse('Invite membership update failed. Ask your administrator to resend invite.', 409);
    }

    return createSuccessResponse({ message: 'Password set successfully' });
  } catch (error) {
    return handleApiError(error, 'Failed to set password');
  }
}
