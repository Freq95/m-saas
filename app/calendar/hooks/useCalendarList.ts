import useSWR from 'swr';
import { authFetcher } from '@/lib/fetcher';
import type { CalendarPermissions } from './useCalendar';

export interface CalendarListItem {
  id: number;
  name: string;
  /** Resolved hex for display (calendar dot, appointment-modal chip). */
  color_mine: string;
  color_others: string | null;
  is_default?: boolean;
  is_active?: boolean;
  isOwner: boolean;
  permissions: CalendarPermissions;
  shareId: number | null;
  sharedByName?: string | null;
  dentistDisplayName?: string | null;
  /** Palette color ID for the calendar owner (settings color picker). */
  ownerColorId?: string | null;
  /** Palette color ID for the share recipient (settings color picker). */
  dentistColorId?: string | null;
  /** Palette IDs currently taken by other participants on this calendar. */
  takenColors?: string[];
}

export interface SentPendingShare {
  id: number;
  calendar_id: number;
  shared_with_email: string;
  dentist_display_name: string | null;
  created_at: string | null;
}

interface CalendarListResponse {
  ownCalendars?: CalendarListItem[];
  sharedCalendars?: CalendarListItem[];
  sentPendingShares?: SentPendingShare[];
}

interface UseCalendarListResult {
  ownCalendars: CalendarListItem[];
  sharedCalendars: CalendarListItem[];
  calendars: CalendarListItem[];
  sentShares: SentPendingShare[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

interface UseCalendarListOptions {
  fallbackData?: CalendarListResponse | null;
}

export function useCalendarList(options: UseCalendarListOptions = {}): UseCalendarListResult {
  const { data, error, isLoading, mutate } = useSWR<CalendarListResponse>(
    '/api/calendars',
    authFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
      fallbackData: options.fallbackData ?? undefined,
    }
  );

  const ownCalendars = data?.ownCalendars || [];
  const sharedCalendars = data?.sharedCalendars || [];

  return {
    ownCalendars,
    sharedCalendars,
    calendars: [...ownCalendars, ...sharedCalendars],
    sentShares: data?.sentPendingShares || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch: async () => {
      await mutate();
    },
  };
}
