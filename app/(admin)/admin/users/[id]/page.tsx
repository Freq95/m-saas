import { notFound, redirect } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { getSuperAdmin } from '@/lib/auth-helpers';
import { logDataAccess } from '@/lib/audit';
import UserDetailClient from './UserDetailClient';

type UserDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const superAdmin = await getSuperAdmin().catch(() => null);
  if (!superAdmin) {
    redirect('/login');
  }
  const { userId: actorUserId, email: actorEmail } = superAdmin;
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const userId = new ObjectId(id);
  const db = await getMongoDbOrThrow();

  const user = await db.collection('users').findOne({ _id: userId });
  if (!user) notFound();

  const [tenant, memberships] = await Promise.all([
    user.tenant_id ? db.collection('tenants').findOne({ _id: user.tenant_id }) : null,
    db.collection('team_members').find({ user_id: userId }).toArray(),
  ]);

  await logDataAccess({
    actorUserId,
    actorEmail,
    actorRole: 'super_admin',
    targetType: 'user',
    targetId: userId,
    route: `/admin/users/${id}`,
    metadata: {
      membershipCount: memberships.length,
    },
  });

  return (
    <UserDetailClient
      user={user ? { _id: String(user._id), ...stripMongoId(user) } : null}
      tenant={tenant ? { _id: String(tenant._id), ...stripMongoId(tenant) } : null}
      memberships={memberships.map((m: any) => ({
        _id: String(m._id),
        ...stripMongoId(m),
        tenant_id: m.tenant_id ? String(m.tenant_id) : null,
        user_id: m.user_id ? String(m.user_id) : null,
      }))}
    />
  );
}
