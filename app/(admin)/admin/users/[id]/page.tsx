import { notFound } from 'next/navigation';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import UserDetailClient from './UserDetailClient';

type UserDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function UserDetailPage({ params }: UserDetailPageProps) {
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

  return <UserDetailClient user={user} tenant={tenant} memberships={memberships} />;
}
