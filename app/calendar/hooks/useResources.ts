import { useState, useEffect } from 'react';
import type { Resource } from './useCalendar';
import { logger } from '@/lib/logger';

interface UseResourcesResult {
  resources: Resource[];
  loading: boolean;
  error: string | null;
}

export function useResources(userId: number = 1): UseResourcesResult {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchResources = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/resources?userId=${userId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch resources');
        }

        const result = await response.json();
        setResources(result.resources || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        logger.error('Calendar hook: failed to fetch resources', err instanceof Error ? err : new Error(String(err)), {
          userId,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchResources();
  }, [userId]);

  return { resources, loading, error };
}
