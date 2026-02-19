import { notFound } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import TenantDetailClient from './TenantDetailClient';

type TenantDetailPageProps = {
  params: { id: string };
};

export default async function TenantDetailPage({ params }: TenantDetailPageProps) {
  if (!ObjectId.isValid(params.id)) notFound();
  const tenantId = new ObjectId(params.id);
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
      ...member,
      name: user?.name || null,
      email: user?.email || null,
    };
  });

  const seatUsage = enrichedMembers.filter((member: any) => ['active', 'pending_invite'].includes(member.status)).length;

  return <TenantDetailClient tenant={tenant} owner={owner} members={enrichedMembers} seatUsage={seatUsage} />;
}
