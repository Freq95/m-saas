import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { startOfWeek, startOfDay, endOfDay, addDays } from 'date-fns';
import CalendarPageClient from './CalendarPageClient';
import { getAuthUser } from '@/lib/auth-helpers';
import { getAppointmentsData, getServicesData } from '@/lib/server/calendar';

export const revalidate = 0;

export default async function CalendarPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch {
    redirect('/login');
  }

  const now = new Date();
  const weekStart = startOfDay(startOfWeek(now, { weekStartsOn: 1 }));
  const weekEnd = endOfDay(addDays(weekStart, 6));

  const [initialAppointments, initialServices] = await Promise.all([
    getAppointmentsData({
      userId: auth.userId,
      tenantId: auth.tenantId,
      startDate: weekStart,
      endDate: weekEnd,
    }).catch(() => []),
    getServicesData(auth.userId, auth.tenantId).catch(() => []),
  ]);

  return (
    <Suspense>
      <CalendarPageClient
        initialAppointments={initialAppointments as any}
        initialServices={initialServices as any}
        initialDate={now.toISOString()}
        initialViewType="week"
      />
    </Suspense>
  );
}
