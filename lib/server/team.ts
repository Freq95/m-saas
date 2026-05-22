import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { getCached } from '@/lib/redis';
import { withRedisPrefix } from '@/lib/redis-prefix';
import type { AuthContext } from '@/lib/auth-helpers';

export interface TeamMemberRow {
  userId: string;
  numericUserId: number | null;
  email: string;
  name: string | null;
  role: string;
  status: string;
  invitedAt: string;
  acceptedAt: string | null;
  assignedDentistUserIds: number[];
  defaultCalendarActive: boolean;
  calendarColor: string | null;
}

export interface TeamSeats {
  used: number;
  max: number;
}

export interface TeamData {
  members: TeamMemberRow[];
  seats: TeamSeats;
}

function normalizeTeamRole(role: unknown): string {
  return role === 'staff' ? 'dentist' : String(role || 'dentist');
}

export async function getTeamData(auth: AuthContext): Promise<TeamData> {
  // Tag key matches the extractTags pattern in lib/redis.ts so write paths can
  // invalidate via `t-{tenantId}-u-{userId}-team`. 5-min TTL — team membership
  // changes are infrequent.
  const cacheKey = withRedisPrefix(`cache:v1:t:${auth.tenantId}:u:${auth.userId}:team:list`);
  return getCached(cacheKey, 300, () => fetchTeamData(auth));
}

async function fetchTeamData(auth: AuthContext): Promise<TeamData> {
  const db = await getMongoDbOrThrow();

  const [tenant, members] = await Promise.all([
    db.collection('tenants').findOne({ _id: auth.tenantId }),
    db
      .collection('team_members')
      .find({ tenant_id: auth.tenantId })
      .sort({ invited_at: -1 })
      .toArray(),
  ]);

  const userIds = members.map((m: any) => m.user_id).filter(Boolean);
  const users =
    userIds.length > 0
      ? await db
          .collection('users')
          .find({ _id: { $in: userIds }, tenant_id: auth.tenantId })
          .toArray()
      : [];
  const userById = new Map<string, any>(users.map((u: any) => [String(u._id), u]));
  const numericUserIds = users
    .map((u: any) => u.id)
    .filter((id: unknown): id is number => typeof id === 'number');
  const defaultCalendars = numericUserIds.length > 0
    ? await db.collection('calendars').find({
        tenant_id: auth.tenantId,
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
  const canSeePrivateFields = auth.role === 'owner';

  const rows: TeamMemberRow[] = members.map((m: any) => {
    const user = userById.get(String(m.user_id));
    const numericUserId = typeof user?.id === 'number' ? user.id : null;
    const assignedDentistUserIds = Array.isArray(m.assigned_dentist_user_ids)
      ? m.assigned_dentist_user_ids.filter((id: unknown): id is number => (
          typeof id === 'number' && Number.isInteger(id) && id > 0
        ))
      : [];
    return {
      userId: String(m.user_id),
      numericUserId,
      email: canSeePrivateFields ? user?.email || m.email || '' : '',
      name: user?.name || null,
      role: normalizeTeamRole(user?.role || m.role),
      status: canSeePrivateFields ? m.status || 'pending' : 'active',
      invitedAt: canSeePrivateFields ? m.invited_at || '' : '',
      acceptedAt: canSeePrivateFields ? m.accepted_at || null : null,
      assignedDentistUserIds,
      defaultCalendarActive: numericUserId ? defaultCalendarByUserId.get(numericUserId)?.active ?? false : false,
      calendarColor: numericUserId ? defaultCalendarByUserId.get(numericUserId)?.color ?? null : null,
    };
  });

  const activeCount = members.filter((m: any) => m.status !== 'removed').length;
  const maxSeats = Number((tenant as any)?.max_seats || 0);

  return {
    members: rows,
    seats: { used: activeCount, max: maxSeats },
  };
}
