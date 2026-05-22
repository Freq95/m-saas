import { Suspense } from 'react';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import {
  getCalendarListForUser,
  getPendingSharesForUser,
} from '@/lib/server/calendars-list';
import {
  getAppointmentCategoriesForDentist,
  getManagedCategoryDentists,
  type AppointmentCategory,
} from '@/lib/server/appointment-categories';
import { SettingsSkeleton } from '../SettingsSkeleton';
import CalendarsSettingsPageClient from './CalendarsSettingsPageClient';

export const revalidate = 30;

export default function CalendarsSettingsPage() {
  return (
    <Suspense fallback={<SettingsSkeleton activeTab="calendars" />}>
      <CalendarsContent />
    </Suspense>
  );
}

async function CalendarsContent() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  const managedCategoryDentistsPromise = getManagedCategoryDentists({
    tenantId: auth.tenantId,
    role: auth.role,
    userId: auth.userId,
    assignedDentistUserIds: auth.assigned_dentist_user_ids,
  }).catch(() => []);

  // Speculatively fetch the categories for the dentist we *expect* to be first.
  // For dentist/owner that's the user themselves; for asistent it's the first
  // assigned dentist. Lets us run categories in parallel with the calendar list
  // instead of waiting for managedCategoryDentists to resolve first.
  const predictedCategoryDentistUserId: number | null =
    auth.role === 'dentist' || auth.role === 'owner'
      ? auth.userId
      : auth.role === 'asistent'
        ? auth.assigned_dentist_user_ids?.[0] ?? null
        : null;
  const speculativeCategoriesPromise: Promise<AppointmentCategory[]> = predictedCategoryDentistUserId !== null
    ? getAppointmentCategoriesForDentist(predictedCategoryDentistUserId, auth.tenantId).catch(() => [])
    : Promise.resolve([]);

  const [calendarList, pendingShareList, managedCategoryDentists, speculativeCategories] = await Promise.all([
    getCalendarListForUser(auth).catch(() => null),
    getPendingSharesForUser(auth).catch(() => null),
    managedCategoryDentistsPromise,
    speculativeCategoriesPromise,
  ]);

  const initialCategoryDentistUserId = managedCategoryDentists[0]?.userId ?? null;
  let initialAppointmentCategories: AppointmentCategory[] = [];
  if (initialCategoryDentistUserId !== null) {
    // Use the speculative result when our prediction matched (common case);
    // otherwise issue the correct query as a fallback.
    initialAppointmentCategories = initialCategoryDentistUserId === predictedCategoryDentistUserId
      ? speculativeCategories
      : await getAppointmentCategoriesForDentist(initialCategoryDentistUserId, auth.tenantId).catch(() => []);
  }

  return (
    <CalendarsSettingsPageClient
      initialRole={auth.role}
      initialUserId={auth.userId}
      initialCalendarList={calendarList}
      initialPendingShareList={pendingShareList}
      categoryDentists={managedCategoryDentists}
      initialCategoryDentistUserId={initialCategoryDentistUserId}
      initialAppointmentCategories={initialAppointmentCategories}
    />
  );
}
