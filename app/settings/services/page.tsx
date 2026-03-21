import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth-helpers';
import { getServicesData } from '@/lib/server/calendar';
import ServicesSettingsPageClient, { type Service } from './ServicesSettingsPageClient';

export const revalidate = 30;

export default async function ServicesSettingsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch {
    redirect('/login');
  }

  let initialServices: Service[] = [];
  try {
    initialServices = (await getServicesData(auth.userId, auth.tenantId)) as Service[];
  } catch {
    initialServices = [];
  }

  return <ServicesSettingsPageClient initialServices={initialServices} />;
}
