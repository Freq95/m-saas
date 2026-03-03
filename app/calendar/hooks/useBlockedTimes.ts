import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { logger } from '@/lib/logger';
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
        const params = new URLSearchParams({
          userId: effectiveUserId.toString(),
          ...(providerId && { providerId: providerId.toString() }),
          ...(resourceId && { resourceId: resourceId.toString() }),
          ...(startDate && { startDate: startDate.toISOString() }),
          ...(endDate && { endDate: endDate.toISOString() }),
        });

        const response = await fetch(`/api/blocked-times?${params}`, { signal: controller.signal });

        if (!response.ok) {
          throw new Error('Failed to fetch blocked times');
        }

        const result = await response.json();
        if (!controller.signal.aborted) {
          setBlockedTimes(result.blockedTimes || []);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        logger.error('Calendar hook: failed to fetch blocked times', err instanceof Error ? err : new Error(String(err)), {
          userId: effectiveUserId,
          providerId: providerId || null,
          resourceId: resourceId || null,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
        });
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
