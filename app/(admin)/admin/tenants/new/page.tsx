import { redirect } from 'next/navigation';
import { getSuperAdmin } from '@/lib/auth-helpers';
import CreateTenantForm from './CreateTenantForm';

export default async function NewTenantPage() {
  try { await getSuperAdmin(); } catch { redirect('/login'); }
  return <CreateTenantForm />;
}
