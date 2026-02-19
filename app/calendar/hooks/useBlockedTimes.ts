import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { logger } from '@/lib/logger';

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
  const sessionUserId =
    session?.user?.id && /^[1-9]\d*$/.test(session.user.id)
      ? Number.parseInt(session.user.id, 10)
      : null;
  const effectiveUserId = userId ?? sessionUserId;
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

        const response = await fetch(`/api/blocked-times?${params}`);

        if (!response.ok) {
          throw new Error('Failed to fetch blocked times');
        }

        const result = await response.json();
        setBlockedTimes(result.blockedTimes || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        logger.error('Calendar hook: failed to fetch blocked times', err instanceof Error ? err : new Error(String(err)), {
          userId: effectiveUserId,
          providerId: providerId || null,
          resourceId: resourceId || null,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchBlockedTimes();
  }, [effectiveUserId, providerId, resourceId, startDate, endDate, status]);

  return { blockedTimes, loading, error };
}
