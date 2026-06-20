import useSWR from 'swr';

export interface AppointmentCategoryOption {
  id: number;
  key: string;
  label: string;
  color: string;
  position: number;
}

async function fetchAppointmentCategories(url: string): Promise<AppointmentCategoryOption[]> {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'Nu am putut încărca categoriile.');
  }
  return Array.isArray(payload?.categories) ? payload.categories : [];
}

export function useAppointmentCategories(args: {
  isOpen: boolean;
  calendarId?: number | null;
  dentistUserId?: number | null;
}) {
  const { isOpen, calendarId, dentistUserId } = args;
  const key = isOpen
    ? (() => {
        const params = new URLSearchParams();
        if (calendarId) params.set('calendarId', String(calendarId));
        if (dentistUserId) params.set('dentistUserId', String(dentistUserId));
        return `/api/appointment-categories?${params.toString()}`;
      })()
    : null;

  const { data, error, isLoading, mutate } = useSWR<AppointmentCategoryOption[]>(
    key,
    fetchAppointmentCategories,
    {
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );

  return {
    categories: data ?? [],
    loading: Boolean(isLoading),
    error: error instanceof Error ? error.message : null,
    refetch: mutate,
  };
}
