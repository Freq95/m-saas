import { addDays, startOfWeek } from 'date-fns';
import { redirect } from 'next/navigation';
import CalendarPageClient from './CalendarPageClient';
import { getAppointmentsData, getServicesData } from '@/lib/server/calendar';
import { auth } from '@/lib/auth';

export const revalidate = 30;

export default async function CalendarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = Number.parseInt(session.user.id, 10);
  if (!Number.isFinite(userId) || userId <= 0) redirect('/login');

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  const [appointments, services] = await Promise.all([
    getAppointmentsData({
      userId,
      startDate: weekStart,
      endDate: weekEnd,
    }),
    getServicesData(userId),
  ]);

  return (
    <CalendarPageClient
      initialAppointments={appointments}
      initialServices={services as any[]}
      initialDate={today.toISOString()}
      initialViewType="week"
      initialUserId={userId}
    />
  );
}
