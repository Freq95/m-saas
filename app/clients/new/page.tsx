import NewClientPageClient from './NewClientPageClient';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';

export const dynamic = 'force-dynamic';

export default async function NewClientPage({
  searchParams,
}: {
  searchParams?: Promise<{ dentistUserId?: string | string[] }>;
}) {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  const params = searchParams ? await searchParams : {};
  const rawDentistUserId = Array.isArray(params.dentistUserId)
    ? params.dentistUserId[0]
    : params.dentistUserId;
  const requestedDentistUserId = rawDentistUserId ? Number.parseInt(rawDentistUserId, 10) : null;
  const dentistUserId = auth.role === 'asistent'
    ? (
        requestedDentistUserId && auth.assigned_dentist_user_ids?.includes(requestedDentistUserId)
          ? requestedDentistUserId
          : auth.assigned_dentist_user_ids?.[0] ?? null
      )
    : null;

  return <NewClientPageClient dentistUserId={dentistUserId} />;
}
