import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import type { AuthContext } from '@/lib/auth-helpers';

export interface TeamMemberRow {
  userId: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  invitedAt: string;
  acceptedAt: string | null;
}

export interface TeamSeats {
  used: number;
  max: number;
}

export interface TeamData {
  members: TeamMemberRow[];
  seats: TeamSeats;
}

export async function getTeamData(auth: AuthContext): Promise<TeamData> {
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

  const rows: TeamMemberRow[] = members.map((m: any) => {
    const user = userById.get(String(m.user_id));
    return {
      userId: String(m.user_id),
      email: user?.email || m.email || '',
      name: user?.name || null,
      role: m.role || 'staff',
      status: m.status || 'pending',
      invitedAt: m.invited_at || '',
      acceptedAt: m.accepted_at || null,
    };
  });

  const activeCount = members.filter((m: any) => m.status !== 'removed').length;
  const maxSeats = Number((tenant as any)?.max_seats || 0);

  return {
    members: rows,
    seats: { used: activeCount, max: maxSeats },
  };
}
