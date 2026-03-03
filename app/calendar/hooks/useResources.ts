import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { Resource } from './useCalendar';
import { logger } from '@/lib/logger';
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
        const response = await fetch(`/api/resources?userId=${effectiveUserId}`, { signal: controller.signal });

        if (!response.ok) {
          throw new Error('Failed to fetch resources');
        }

        const result = await response.json();
        if (!controller.signal.aborted) {
          setResources(result.resources || []);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        logger.error('Calendar hook: failed to fetch resources', err instanceof Error ? err : new Error(String(err)), {
          userId: effectiveUserId,
        });
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
