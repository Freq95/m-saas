import { Suspense } from 'react';
import CalendarPageClient from './CalendarPageClient';

export default function CalendarPage() {
  return (
    <Suspense>
      <CalendarPageClient
        initialAppointments={[]}
        initialServices={[]}
        initialDate={new Date().toISOString()}
        initialViewType="week"
      />
    </Suspense>
  );
}
