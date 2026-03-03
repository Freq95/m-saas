import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { Provider } from './useCalendar';
import { logger } from '@/lib/logger';
import { parseSessionUserId } from './sessionUser';

interface UseProvidersResult {
  providers: Provider[];
  loading: boolean;
  error: string | null;
}

export function useProviders(userId?: number): UseProvidersResult {
  const { data: session, status } = useSession();
  const effectiveUserId = userId ?? parseSessionUserId(session);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchProviders = async () => {
      if (status === 'loading') return;
      if (!effectiveUserId) {
        setProviders([]);
        setLoading(false);
        setError('Not authenticated');
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/providers?userId=${effectiveUserId}`, { signal: controller.signal });

        if (!response.ok) {
          throw new Error('Failed to fetch providers');
        }

        const result = await response.json();
        if (!controller.signal.aborted) {
          setProviders(result.providers || []);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        logger.error('Calendar hook: failed to fetch providers', err instanceof Error ? err : new Error(String(err)), {
          userId: effectiveUserId,
        });
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchProviders();
    return () => controller.abort();
  }, [effectiveUserId, status]);

  return { providers, loading, error };
}
