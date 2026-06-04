import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getServicesData } from '@/lib/server/calendar';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { getCached } from '@/lib/redis';
import { withRedisPrefix } from '@/lib/redis-prefix';
import ServicesSettingsPageClient, { type DentistOption, type Service } from './ServicesSettingsPageClient';

export const revalidate = 30;

export default async function ServicesSettingsPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  let initialServices: Service[] = [];
  let dentists: DentistOption[] = [];
  let selectedDentistUserId: number | null = auth.userId;
  try {
    const db = await getMongoDbOrThrow();
    const dentistFilter: Record<string, unknown> = {
      tenant_id: auth.tenantId,
      role: { $in: ['owner', 'dentist'] },
      status: { $ne: 'deleted' },
    };
    if (auth.role === 'asistent') {
      dentistFilter.id = { $in: auth.assigned_dentist_user_ids ?? [] };
    }

    const dentistDocs = await db.collection('users').find(dentistFilter)
      .project({ id: 1, name: 1, email: 1 })
      .sort({ name: 1 })
      .toArray();
    dentists = dentistDocs
      .filter((dentist: any) => typeof dentist.id === 'number')
      .map((dentist: any) => ({
        userId: dentist.id,
        name: dentist.name || dentist.email || `Medic ${dentist.id}`,
      }));

    if (auth.role === 'asistent') {
      selectedDentistUserId = auth.assigned_dentist_user_ids?.[0] ?? null;
    }
    if (auth.role === 'receptionist') {
      selectedDentistUserId = null;
      const dentistIds = dentists.map((dentist) => dentist.userId);
      if (dentistIds.length > 0) {
        // Receptionists see services across all dentists — same payload for the
        // whole tenant, so we key by tenant only. 5-min TTL; invalidated when
        // a service is created/updated via the service write endpoints.
        const cacheKey = withRedisPrefix(
          `cache:v1:t:${auth.tenantId}:u:${auth.userId}:services:all_dentists:${dentistIds.sort((a, b) => a - b).join(',')}`
        );
        initialServices = await getCached(cacheKey, 300, async () => {
          const docs = await db.collection('services').find({
            tenant_id: auth.tenantId,
            user_id: { $in: dentistIds },
            deleted_at: { $exists: false },
          }).sort({ user_id: 1, name: 1 }).toArray();
          return docs.map(stripMongoId) as Service[];
        });
      } else {
        initialServices = [];
      }
    } else if (selectedDentistUserId) {
      initialServices = (await getServicesData(selectedDentistUserId, auth.tenantId)) as Service[];
    }
  } catch {
    initialServices = [];
  }

  return (
    <ServicesSettingsPageClient
      initialServices={initialServices}
      role={auth.role}
      dentists={dentists}
      initialSelectedDentistUserId={selectedDentistUserId}
    />
  );
}
