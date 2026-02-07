import { addDays, startOfWeek } from 'date-fns';
import CalendarPageClient from './CalendarPageClient';
import { getAppointmentsData, getServicesData } from '@/lib/server/calendar';
import { DEFAULT_USER_ID } from '@/lib/constants';

export const revalidate = 30;

export default async function CalendarPage() {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);

  const [appointments, services] = await Promise.all([
    getAppointmentsData({
      userId: DEFAULT_USER_ID,
      startDate: weekStart,
      endDate: weekEnd,
    }),
    getServicesData(DEFAULT_USER_ID),
  ]);

  return (
    <CalendarPageClient
      initialAppointments={appointments}
      initialServices={services as any[]}
      initialDate={today.toISOString()}
      initialViewType="week"
    />
  );
}
