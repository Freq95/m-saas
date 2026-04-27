import { redirect } from 'next/navigation';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getCached } from '@/lib/redis';
import { dashboardCacheKey } from '@/lib/cache-keys';
import { getDashboardData } from '@/lib/server/dashboard';
import DashboardPageClient from './DashboardPageClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  if (auth.role === 'super_admin') {
    redirect('/admin');
  }

  const days = 7;
  const initialDashboard = await getCached(
    dashboardCacheKey({ tenantId: auth.tenantId, userId: auth.userId }, days),
    900,
    () => getDashboardData(auth.userId, auth.tenantId, days)
  ).catch(() => null);

  return <DashboardPageClient initialDashboard={initialDashboard} />;
}
