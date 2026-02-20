import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';

export async function GET(_request: NextRequest) {
  try {
    const { tenantId, role } = await getAuthUser();
    if (role !== 'owner') {
      return createErrorResponse('Only clinic owner can view team members', 403);
    }

    const db = await getMongoDbOrThrow();
    const tenant = await db.collection('tenants').findOne({ _id: tenantId });
    if (!tenant) {
      return createErrorResponse('Tenant not found', 404);
    }

    const members = await db.collection('team_members').find({ tenant_id: tenantId }).sort({ invited_at: -1 }).toArray();
    const userIds = members.map((m: any) => m.user_id).filter(Boolean);
    const users = userIds.length > 0
      ? await db.collection('users').find({ _id: { $in: userIds }, tenant_id: tenantId }).toArray()
      : [];
    const userById = new Map<string, any>(users.map((u: any) => [String(u._id), u]));

    const data = members.map((member: any) => {
      const user = userById.get(String(member.user_id));
      return stripMongoId({
        ...member,
        name: user?.name || null,
        user_email: user?.email || member.email || null,
      });
    });

    const usedSeats = members.filter((member: any) => member.status !== 'removed').length;
    const maxSeats = Number((tenant as any).max_seats || 0);

    return createSuccessResponse({
      members: data,
      seats: {
        used: usedSeats,
        max: maxSeats,
        label: `${usedSeats} / ${maxSeats} seats`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch team members');
  }
}
