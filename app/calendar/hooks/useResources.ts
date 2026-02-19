import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { Resource } from './useCalendar';
import { logger } from '@/lib/logger';

interface UseResourcesResult {
  resources: Resource[];
  loading: boolean;
  error: string | null;
}

function parseSessionUserId(rawId: string | undefined): number | null {
  if (!rawId || !/^[1-9]\d*$/.test(rawId)) return null;
  const parsed = Number.parseInt(rawId, 10);
  return Number.isFinite(parsed) && String(parsed) === rawId ? parsed : null;
}

export function useResources(userId?: number): UseResourcesResult {
  const { data: session, status } = useSession();
  const effectiveUserId = userId ?? parseSessionUserId(session?.user?.id);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        const response = await fetch(`/api/resources?userId=${effectiveUserId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch resources');
        }

        const result = await response.json();
        setResources(result.resources || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        logger.error('Calendar hook: failed to fetch resources', err instanceof Error ? err : new Error(String(err)), {
          userId: effectiveUserId,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchResources();
  }, [effectiveUserId, status]);

  return { resources, loading, error };
}
