import { NextRequest } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';

function normalizeTeamRole(role: unknown): string {
  return role === 'staff' ? 'dentist' : String(role || 'dentist');
}

export async function GET(_request: NextRequest) {
  try {
    const { tenantId, role } = await getAuthUser();
    const canSeePrivateFields = role === 'owner';

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
    const numericUserIds = users
      .map((u: any) => u.id)
      .filter((id: unknown): id is number => typeof id === 'number');
    const defaultCalendars = numericUserIds.length > 0
      ? await db.collection('calendars').find({
          tenant_id: tenantId,
          owner_user_id: { $in: numericUserIds },
          is_default: true,
          deleted_at: { $exists: false },
        }).toArray()
      : [];
    const defaultCalendarByUserId = new Map<number, { active: boolean; color: string | null }>(
      defaultCalendars
        .filter((calendar: any) => typeof calendar.owner_user_id === 'number')
        .map((calendar: any) => [
          calendar.owner_user_id,
          {
            active: Boolean(calendar.is_active),
            color: typeof calendar.color_mine === 'string' && calendar.color_mine.length > 0
              ? calendar.color_mine
              : null,
          },
        ])
    );

    const data = members.map((member: any) => {
      const user = userById.get(String(member.user_id));
      const numericUserId = typeof user?.id === 'number' ? user.id : null;
      const assignedDentistUserIds = Array.isArray(member.assigned_dentist_user_ids)
        ? member.assigned_dentist_user_ids.filter((id: unknown): id is number => (
            typeof id === 'number' && Number.isInteger(id) && id > 0
          ))
        : [];
      return {
        userId: String(member.user_id),
        user_id: String(member.user_id),
        numericUserId,
        numeric_user_id: numericUserId,
        name: user?.name || null,
        role: normalizeTeamRole(user?.role || member.role),
        assignedDentistUserIds,
        assigned_dentist_user_ids: assignedDentistUserIds,
        defaultCalendarActive: numericUserId ? defaultCalendarByUserId.get(numericUserId)?.active ?? false : false,
        default_calendar_active: numericUserId ? defaultCalendarByUserId.get(numericUserId)?.active ?? false : false,
        calendarColor: numericUserId ? defaultCalendarByUserId.get(numericUserId)?.color ?? null : null,
        calendar_color: numericUserId ? defaultCalendarByUserId.get(numericUserId)?.color ?? null : null,
        ...(canSeePrivateFields
          ? {
              email: user?.email || member.email || '',
              user_email: user?.email || member.email || null,
              status: member.status || 'pending',
              invitedAt: member.invited_at || '',
              invited_at: member.invited_at || '',
              acceptedAt: member.accepted_at || null,
              accepted_at: member.accepted_at || null,
            }
          : {}),
      };
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
