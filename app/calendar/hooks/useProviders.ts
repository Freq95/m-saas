import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type { Provider } from './useCalendar';
import { logger } from '@/lib/logger';

interface UseProvidersResult {
  providers: Provider[];
  loading: boolean;
  error: string | null;
}

function parseSessionUserId(rawId: string | undefined): number | null {
  if (!rawId || !/^[1-9]\d*$/.test(rawId)) return null;
  const parsed = Number.parseInt(rawId, 10);
  return Number.isFinite(parsed) && String(parsed) === rawId ? parsed : null;
}

export function useProviders(userId?: number): UseProvidersResult {
  const { data: session, status } = useSession();
  const effectiveUserId = userId ?? parseSessionUserId(session?.user?.id);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        const response = await fetch(`/api/providers?userId=${effectiveUserId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch providers');
        }

        const result = await response.json();
        setProviders(result.providers || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        logger.error('Calendar hook: failed to fetch providers', err instanceof Error ? err : new Error(String(err)), {
          userId: effectiveUserId,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchProviders();
  }, [effectiveUserId, status]);

  return { providers, loading, error };
}
