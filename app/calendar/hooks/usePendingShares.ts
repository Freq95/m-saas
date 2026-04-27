import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { authFetcher } from '@/lib/fetcher';

export interface PendingShareCalendar {
  id: number;
  name: string;
  color_mine: string;
  color_others: string;
}

export interface PendingCalendarShare {
  id: number;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  shared_with_email: string;
  shared_by_name?: string | null;
  dentist_display_name?: string | null;
  calendar_id: number;
  calendar: PendingShareCalendar;
}

interface PendingSharesResponse {
  pendingShares?: PendingCalendarShare[];
}

interface PendingShareActionResult {
  ok: boolean;
  error?: string;
}

interface UsePendingSharesResult {
  pendingShares: PendingCalendarShare[];
  loading: boolean;
  error: string | null;
  actionShareId: number | null;
  refetch: () => Promise<void>;
  acceptShare: (shareId: number) => Promise<PendingShareActionResult>;
  declineShare: (shareId: number) => Promise<PendingShareActionResult>;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'error' in payload &&
    typeof (payload as { error?: unknown }).error === 'string'
  ) {
    return (payload as { error: string }).error;
  }

  return fallback;
}

interface UsePendingSharesOptions {
  fallbackData?: PendingSharesResponse | null;
}

export function usePendingShares(options: UsePendingSharesOptions = {}): UsePendingSharesResult {
  const [actionShareId, setActionShareId] = useState<number | null>(null);
  const { data, error, isLoading, mutate } = useSWR<PendingSharesResponse>(
    '/api/calendar-shares/pending',
    authFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
      fallbackData: options.fallbackData ?? undefined,
    }
  );

  const actOnShare = useCallback(
    async (shareId: number, action: 'accept' | 'decline'): Promise<PendingShareActionResult> => {
      setActionShareId(shareId);
      try {
        const response = await fetch('/api/calendar-shares/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shareId,
            ...(action === 'decline' ? { action: 'decline' } : {}),
          }),
        });

        if (response.status === 401) {
          window.location.href = '/login';
          return { ok: false, error: 'Sesiune expirata.' };
        }

        if (!response.ok) {
          let payload: unknown = null;
          try {
            payload = await response.json();
          } catch {
            payload = null;
          }
          return {
            ok: false,
            error: extractErrorMessage(
              payload,
              action === 'accept'
                ? 'Nu am putut accepta invitatia.'
                : 'Nu am putut refuza invitatia.'
            ),
          };
        }

        await mutate();
        return { ok: true };
      } catch {
        return {
          ok: false,
          error: action === 'accept'
            ? 'Eroare de retea la acceptarea invitatiei.'
            : 'Eroare de retea la refuzarea invitatiei.',
        };
      } finally {
        setActionShareId(null);
      }
    },
    [mutate]
  );

  return {
    pendingShares: data?.pendingShares || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    actionShareId,
    refetch: async () => {
      await mutate();
    },
    acceptShare: (shareId) => actOnShare(shareId, 'accept'),
    declineShare: (shareId) => actOnShare(shareId, 'decline'),
  };
}
