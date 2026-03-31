import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logDataAccess } from '@/lib/audit';
import TenantDetailClient from './TenantDetailClient';

type TenantDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ inviteToken?: string }>;
};

export default async function TenantDetailPage({ params, searchParams }: TenantDetailPageProps) {
  const superAdmin = await getSuperAdmin().catch(() => null);
  if (!superAdmin) {
    redirect('/login');
  }
  const { userId: actorUserId, email: actorEmail } = superAdmin;
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialInviteToken = typeof resolvedSearchParams?.inviteToken === 'string' ? resolvedSearchParams.inviteToken : null;
  if (!ObjectId.isValid(id)) notFound();
  const tenantId = new ObjectId(id);
  const db = await getMongoDbOrThrow();

  const tenant = await db.collection('tenants').findOne({ _id: tenantId });
  if (!tenant) notFound();

  const [owner, members] = await Promise.all([
    tenant.owner_id ? db.collection('users').findOne({ _id: tenant.owner_id }) : null,
    db.collection('team_members').find({ tenant_id: tenantId }).toArray(),
  ]);

  const userIds = members.map((member: any) => member.user_id).filter(Boolean);
  const users = userIds.length ? await db.collection('users').find({ _id: { $in: userIds } }).toArray() : [];
  const userMap = new Map<string, any>(users.map((user: any) => [String(user._id), user]));

  const enrichedMembers = members.map((member: any) => {
    const user = userMap.get(String(member.user_id));
    return {
      _id: String(member._id),
      ...stripMongoId(member),
      name: user?.name || null,
      email: user?.email || null,
    };
  });

  const seatUsage = enrichedMembers.filter((member: any) => ['active', 'pending_invite'].includes(member.status)).length;

  await logDataAccess({
    actorUserId,
    actorEmail,
    actorRole: 'super_admin',
    targetType: 'tenant',
    targetId: tenantId,
    route: `/admin/tenants/${id}`,
    metadata: {
      memberCount: enrichedMembers.length,
      seatUsage,
    },
  });

  return (
    <TenantDetailClient
      tenant={{ _id: String(tenant._id), ...stripMongoId(tenant) }}
      owner={owner ? { _id: String(owner._id), ...stripMongoId(owner) } : null}
      members={enrichedMembers}
      seatUsage={seatUsage}
      initialInviteToken={initialInviteToken}
    />
  );
}
