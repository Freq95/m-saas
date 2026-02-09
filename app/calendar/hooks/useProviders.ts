import { useState, useEffect } from 'react';
import type { Provider } from './useCalendar';

interface UseProvidersResult {
  providers: Provider[];
  loading: boolean;
  error: string | null;
}

export function useProviders(userId: number = 1): UseProvidersResult {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/providers?userId=${userId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch providers');
        }

        const result = await response.json();
        setProviders(result.providers || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('Error fetching providers:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProviders();
  }, [userId]);

  return { providers, loading, error };
}
