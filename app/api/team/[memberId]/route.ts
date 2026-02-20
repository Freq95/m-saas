import { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { memberId: string } }
) {
  try {
    const { dbUserId, tenantId, role } = await getAuthUser();
    if (role !== 'owner') {
      return createErrorResponse('Only clinic owner can remove team members', 403);
    }

    if (!ObjectId.isValid(params.memberId)) {
      return createErrorResponse('Invalid memberId', 400);
    }

    const memberUserId = new ObjectId(params.memberId);
    if (String(memberUserId) === String(dbUserId)) {
      return createErrorResponse('Owner cannot remove self', 400);
    }

    const db = await getMongoDbOrThrow();
    const member = await db.collection('team_members').findOne({ tenant_id: tenantId, user_id: memberUserId });
    if (!member) {
      return createErrorResponse('Member not found', 404);
    }
    if (member.role === 'owner') {
      return createErrorResponse('Owner cannot be removed', 400);
    }

    const nowIso = new Date().toISOString();
    await db.collection('team_members').updateOne(
      { tenant_id: tenantId, user_id: memberUserId },
      { $set: { status: 'removed', updated_at: nowIso } }
    );
    await db.collection('users').updateOne(
      { _id: memberUserId, tenant_id: tenantId },
      { $set: { status: 'deleted', updated_at: nowIso } }
    );

    return createSuccessResponse({ success: true });
  } catch (error) {
    return handleApiError(error, 'Failed to remove team member');
  }
}
