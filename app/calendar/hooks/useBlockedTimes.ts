import { useState, useEffect } from 'react';

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
  userId: number = 1,
  providerId?: number | null,
  resourceId?: number | null,
  startDate?: Date,
  endDate?: Date
): UseBlockedTimesResult {
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBlockedTimes = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          userId: userId.toString(),
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
        console.error('Error fetching blocked times:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBlockedTimes();
  }, [userId, providerId, resourceId, startDate, endDate]);

  return { blockedTimes, loading, error };
}
