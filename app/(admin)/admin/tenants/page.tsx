import Link from 'next/link';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

type TenantsPageProps = {
  searchParams?: {
    search?: string;
    plan?: string;
    status?: string;
  };
};

export default async function AdminTenantsPage({ searchParams }: TenantsPageProps) {
  const db = await getMongoDbOrThrow();
  const search = searchParams?.search?.trim();
  const plan = searchParams?.plan?.trim();
  const status = searchParams?.status?.trim();

  const filter: Record<string, unknown> = {};
  if (plan) filter.plan = plan;
  if (status) filter.status = status;
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ name: { $regex: escaped, $options: 'i' } }, { slug: { $regex: escaped, $options: 'i' } }];
  }

  const tenants = await db.collection('tenants').find(filter).sort({ created_at: -1 }).toArray();
  const ownerIds = tenants.map((tenant: any) => tenant.owner_id).filter(Boolean);
  const owners = ownerIds.length ? await db.collection('users').find({ _id: { $in: ownerIds } }).toArray() : [];
  const ownerMap = new Map<string, any>(owners.map((owner: any) => [String(owner._id), owner]));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Tenants</h1>
        <Link href="/admin/tenants/new">Create Tenant</Link>
      </div>

      <form style={{ display: 'flex', gap: 8 }}>
        <input name="search" defaultValue={search || ''} placeholder="Search name" />
        <select name="plan" defaultValue={plan || ''}>
          <option value="">All plans</option>
          <option value="free">free</option>
          <option value="starter">starter</option>
          <option value="pro">pro</option>
        </select>
        <select name="status" defaultValue={status || ''}>
          <option value="">All status</option>
          <option value="active">active</option>
          <option value="suspended">suspended</option>
          <option value="deleted">deleted</option>
        </select>
        <button type="submit">Apply</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Plan</th>
            <th>Owner Email</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map((tenant: any) => (
            <tr key={String(tenant._id)}>
              <td>{tenant.name}</td>
              <td>{tenant.plan}</td>
              <td>{ownerMap.get(String(tenant.owner_id))?.email || '-'}</td>
              <td>{tenant.status}</td>
              <td>{tenant.created_at ? new Date(tenant.created_at).toLocaleString() : '-'}</td>
              <td>
                <Link href={`/admin/tenants/${tenant._id}`}>View</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
