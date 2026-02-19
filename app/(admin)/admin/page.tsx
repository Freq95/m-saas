import Link from 'next/link';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

export default async function AdminDashboardPage() {
  const db = await getMongoDbOrThrow();
  const [totalTenants, totalUsers, activeUsers, pendingInvites, plans, recentTenants] = await Promise.all([
    db.collection('tenants').countDocuments({}),
    db.collection('users').countDocuments({}),
    db.collection('users').countDocuments({ status: 'active' }),
    db.collection('users').countDocuments({ status: 'pending_invite' }),
    db
      .collection('tenants')
      .aggregate([
        { $group: { _id: '$plan', count: { $sum: 1 } } },
        { $project: { _id: 0, plan: '$_id', count: 1 } },
      ])
      .toArray(),
    db.collection('tenants').find({}).sort({ created_at: -1 }).limit(10).toArray(),
  ]);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>Admin Dashboard</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
        <div style={{ border: '1px solid #334155', padding: 12 }}>
          <div>Total tenants</div>
          <strong>{totalTenants}</strong>
        </div>
        <div style={{ border: '1px solid #334155', padding: 12 }}>
          <div>Total users</div>
          <strong>{totalUsers}</strong>
        </div>
        <div style={{ border: '1px solid #334155', padding: 12 }}>
          <div>Active users</div>
          <strong>{activeUsers}</strong>
        </div>
        <div style={{ border: '1px solid #334155', padding: 12 }}>
          <div>Pending invites</div>
          <strong>{pendingInvites}</strong>
        </div>
        <div style={{ border: '1px solid #334155', padding: 12 }}>
          <div>Plans</div>
          <strong>{plans.map((p: any) => `${p.plan}: ${p.count}`).join(', ') || 'N/A'}</strong>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Link href="/admin/tenants/new">Create Tenant</Link>
        <Link href="/admin/tenants">View All Tenants</Link>
        <Link href="/admin/users">View All Users</Link>
      </div>
      <section>
        <h2>Recent tenants</h2>
        <ul>
          {recentTenants.map((tenant: any) => (
            <li key={String(tenant._id)}>
              <Link href={`/admin/tenants/${tenant._id}`}>{tenant.name}</Link> ({tenant.plan}) - {tenant.status}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
