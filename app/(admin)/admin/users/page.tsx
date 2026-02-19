import Link from 'next/link';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

type AdminUsersPageProps = {
  searchParams?: {
    search?: string;
    role?: string;
    status?: string;
  };
};

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const db = await getMongoDbOrThrow();
  const search = searchParams?.search?.trim() || '';
  const role = searchParams?.role?.trim() || '';
  const status = searchParams?.status?.trim() || '';

  const filter: Record<string, unknown> = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ email: { $regex: escaped, $options: 'i' } }, { name: { $regex: escaped, $options: 'i' } }];
  }

  const users = await db.collection('users').find(filter).sort({ created_at: -1 }).limit(500).toArray();
  const tenantIds = users
    .map((user: any) => user.tenant_id)
    .filter((tenantId: any) => tenantId !== null && tenantId !== undefined);
  const userIds = users.map((user: any) => user._id);

  const [tenants, memberships] = await Promise.all([
    tenantIds.length ? db.collection('tenants').find({ _id: { $in: tenantIds } }).toArray() : [],
    userIds.length ? db.collection('team_members').find({ user_id: { $in: userIds } }).toArray() : [],
  ]);

  const tenantMap = new Map<string, any>(tenants.map((tenant: any) => [String(tenant._id), tenant]));
  const membershipMap = new Map<string, any[]>();
  for (const membership of memberships as any[]) {
    const key = String(membership.user_id);
    const existing = membershipMap.get(key) || [];
    existing.push(membership);
    membershipMap.set(key, existing);
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h1>Users</h1>
      <p>
        Users represent all accounts in `users`: super-admin plus tenant users (`owner/admin/staff/viewer`), both
        `active` and `pending_invite`.
      </p>

      <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input name="search" defaultValue={search} placeholder="Search by email or name" />
        <select name="role" defaultValue={role}>
          <option value="">All roles</option>
          <option value="super_admin">super_admin</option>
          <option value="owner">owner</option>
          <option value="admin">admin</option>
          <option value="staff">staff</option>
          <option value="viewer">viewer</option>
        </select>
        <select name="status" defaultValue={status}>
          <option value="">All status</option>
          <option value="active">active</option>
          <option value="pending_invite">pending_invite</option>
          <option value="suspended">suspended</option>
          <option value="deleted">deleted</option>
        </select>
        <button type="submit">Apply</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Tenant</th>
            <th>Membership details</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user: any) => {
            const tenant = user.tenant_id ? tenantMap.get(String(user.tenant_id)) : null;
            const memberRows = membershipMap.get(String(user._id)) || [];
            return (
              <tr key={String(user._id)}>
                <td>{user.name || '-'}</td>
                <td>{user.email || '-'}</td>
                <td>{user.role || '-'}</td>
                <td>{user.status || '-'}</td>
                <td>
                  {tenant ? <Link href={`/admin/tenants/${tenant._id}`}>{tenant.name}</Link> : 'Platform (no tenant)'}
                </td>
                <td>
                  {memberRows.length === 0
                    ? '-'
                    : memberRows
                        .map((membership: any) => {
                          const tenantForMembership = tenantMap.get(String(membership.tenant_id));
                          const tenantLabel = tenantForMembership?.name || String(membership.tenant_id);
                          return `${membership.role || '-'} / ${membership.status || '-'} @ ${tenantLabel}`;
                        })
                        .join('; ')}
                </td>
                <td>{user.created_at ? new Date(user.created_at).toLocaleString() : '-'}</td>
                <td>
                  <Link href={`/admin/users/${user._id}`}>Manage</Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
