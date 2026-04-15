import useSWR from 'swr';
import { authFetcher } from '@/lib/fetcher';
import type { CalendarColorMode } from '@/lib/calendar-color-policy';
import type { CalendarPermissions } from './useCalendar';

export interface CalendarListItem {
  id: number;
  name: string;
  color: string;
  is_default?: boolean;
  is_active?: boolean;
  settings?: {
    color_mode?: CalendarColorMode;
  } | null;
  isOwner: boolean;
  permissions: CalendarPermissions;
  shareId: number | null;
  dentistColor: string | null;
  sharedByName?: string | null;
  dentistDisplayName?: string | null;
}

interface CalendarListResponse {
  ownCalendars?: CalendarListItem[];
  sharedCalendars?: CalendarListItem[];
}

interface UseCalendarListResult {
  ownCalendars: CalendarListItem[];
  sharedCalendars: CalendarListItem[];
  calendars: CalendarListItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCalendarList(): UseCalendarListResult {
  const { data, error, isLoading, mutate } = useSWR<CalendarListResponse>(
    '/api/calendars',
    authFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
    }
  );

  const ownCalendars = data?.ownCalendars || [];
  const sharedCalendars = data?.sharedCalendars || [];

  return {
    ownCalendars,
    sharedCalendars,
    calendars: [...ownCalendars, ...sharedCalendars],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch: async () => {
      await mutate();
    },
  };
}
