import CalendarPageClient from './CalendarPageClient';

export default function CalendarPage() {
  return (
    <CalendarPageClient
      initialAppointments={[]}
      initialServices={[]}
      initialDate={new Date().toISOString()}
      initialViewType="week"
    />
  );
}
