import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { parseSessionUserId } from './sessionUser';

interface BlockedTime {
  id: number;
  provider_id?: number;
  resource_id?: number;
  start_time: string;
  end_time: string;
  reason: string;
  is_recurring: boolean;
}

interface UseBlockedTimesResult {
  blockedTimes: BlockedTime[];
  loading: boolean;
  error: string | null;
}

export function useBlockedTimes(
  userId?: number,
  providerId?: number | null,
  resourceId?: number | null,
  startDate?: Date,
  endDate?: Date
): UseBlockedTimesResult {
  const { data: session, status } = useSession();
  const sessionUserId = parseSessionUserId(session);
  const effectiveUserId = userId ?? sessionUserId;
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchBlockedTimes = async () => {
      if (status === 'loading') return;
      if (!effectiveUserId) {
        setBlockedTimes([]);
        setLoading(false);
        setError('Not authenticated');
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          userId: effectiveUserId.toString(),
          ...(providerId && { providerId: providerId.toString() }),
          ...(resourceId && { resourceId: resourceId.toString() }),
          ...(startDate && { startDate: startDate.toISOString() }),
          ...(endDate && { endDate: endDate.toISOString() }),
        });

        const response = await fetch(`/api/blocked-times?${params}`, { signal: controller.signal });

        if (!response.ok) {
          if (!controller.signal.aborted) {
            setBlockedTimes([]);
            setError(null);
          }
          return;
        }

        const result = await response.json();
        if (!controller.signal.aborted) {
          setBlockedTimes(result.blockedTimes || []);
          setError(null);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setBlockedTimes([]);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchBlockedTimes();
    return () => controller.abort();
  }, [effectiveUserId, providerId, resourceId, startDate, endDate, status]);

  return { blockedTimes, loading, error };
}
