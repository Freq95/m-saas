import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { Resource } from './useCalendar';
import { parseSessionUserId } from './sessionUser';

interface UseResourcesResult {
  resources: Resource[];
  loading: boolean;
  error: string | null;
}

export function useResources(userId?: number): UseResourcesResult {
  const { data: session, status } = useSession();
  const effectiveUserId = userId ?? parseSessionUserId(session);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchResources = async () => {
      if (status === 'loading') return;
      if (!effectiveUserId) {
        setResources([]);
        setLoading(false);
        setError('Not authenticated');
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/resources?userId=${effectiveUserId}`, { signal: controller.signal });

        if (!response.ok) {
          if (!controller.signal.aborted) {
            setResources([]);
            setError(null);
          }
          return;
        }

        const result = await response.json();
        if (!controller.signal.aborted) {
          setResources(result.resources || []);
          setError(null);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setResources([]);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchResources();
    return () => controller.abort();
  }, [effectiveUserId, status]);

  return { resources, loading, error };
}
