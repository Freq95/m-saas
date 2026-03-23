import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSuperAdmin } from '@/lib/auth-helpers';
import AdminSignOutButton from '@/components/AdminSignOutButton';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await getSuperAdmin();
  } catch {
    redirect('/login');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '220px 1fr' }}>
      <aside style={{ borderRight: '1px solid #334155', padding: 16 }}>
        <h2 style={{ marginBottom: 12 }}>Admin</h2>
        <nav style={{ display: 'grid', gap: 8 }}>
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/tenants">Tenants</Link>
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/tenants/new">Create Tenant</Link>
          <Link href="/admin/audit">Audit Logs</Link>
          <Link href="/admin/docs">Docs</Link>
        </nav>
        <AdminSignOutButton />
      </aside>
      <main style={{ padding: 20 }}>{children}</main>
    </div>
  );
}
