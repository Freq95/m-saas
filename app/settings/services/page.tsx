import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth-helpers';
import ServicesSettingsPageClient, { type Service } from './ServicesSettingsPageClient';

export const revalidate = 0;

function getBaseUrl(host: string | null, protocolHeader: string | null): string {
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL;
  }

  const protocol = protocolHeader?.split(',')[0]?.trim() || 'http';
  const resolvedHost = host || 'localhost:3000';
  return `${protocol}://${resolvedHost}`;
}

export default async function ServicesSettingsPage() {
  try {
    await getAuthUser();
  } catch {
    redirect('/login');
  }

  const headerStore = await headers();
  const cookieStore = await cookies();
  const baseUrl = getBaseUrl(headerStore.get('host'), headerStore.get('x-forwarded-proto'));

  let initialServices: Service[] = [];

  try {
    const response = await fetch(`${baseUrl}/api/services`, {
      method: 'GET',
      headers: {
        cookie: cookieStore.toString(),
      },
      cache: 'no-store',
    });

    if (response.ok) {
      const data = (await response.json()) as { services?: Service[] };
      if (Array.isArray(data.services)) {
        initialServices = data.services;
      }
    }
  } catch {
    initialServices = [];
  }

  return <ServicesSettingsPageClient initialServices={initialServices} />;
}
