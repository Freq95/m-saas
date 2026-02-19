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
    if (!ObjectId.isValid(params.id)) return createErrorResponse('Invalid user id', 400);
    const userId = new ObjectId(params.id);

    const db = await getMongoDbOrThrow();
    const before = await db.collection('users').findOne({ _id: userId });
    if (!before) return createErrorResponse('User not found', 404);
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) {
      return createErrorResponse('Reason is required for restore', 400);
    }

    const nowIso = new Date().toISOString();
    await db.collection('users').updateOne(
      { _id: userId },
      {
        $set: {
          status: 'active',
          updated_at: nowIso,
          status_reason: reason,
        },
        $unset: { deleted_at: '', deleted_by: '' },
      }
    );
    await db.collection('team_members').updateMany(
      { user_id: userId },
      { $set: { status: 'active', updated_at: nowIso } }
    );
    const user = await db.collection('users').findOne({ _id: userId });

    await logAdminAudit({
      action: 'user.restore',
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
        status: user?.status || 'active',
        deleted_at: user?.deleted_at || null,
      },
      metadata: { reason },
    });

    return createSuccessResponse({ success: true, user });
  } catch (error) {
    return handleApiError(error, 'Failed to restore user');
  }
}
