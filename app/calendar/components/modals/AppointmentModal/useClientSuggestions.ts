import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClientSuggestion } from './types';

interface UseClientSuggestionsOptions {
  isOpen: boolean;
  query: string;
  /** Skip fetching until the name has at least this many non-whitespace chars. */
  minChars?: number;
  /** Debounce window in ms. */
  debounceMs?: number;
}

interface UseClientSuggestionsResult {
  suggestions: ClientSuggestion[];
  loading: boolean;
  error: string | null;
  resolvedQuery: string;
  hasExactNameMatch: boolean;
  /** Exact case-insensitive name match from the returned set, if unique. */
  exactMatch: ClientSuggestion | null;
}

/**
 * Debounced client search against `/api/clients?search=`.
 * Clears stale results immediately and aborts in-flight work when the query changes.
 */
export function useClientSuggestions({
  isOpen,
  query,
  minChars = 2,
  debounceMs = 220,
}: UseClientSuggestionsOptions): UseClientSuggestionsResult {
  const [suggestions, setSuggestions] = useState<ClientSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedQuery, setResolvedQuery] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const normalized = query.trim();
    if (!isOpen || normalized.length < minChars) {
      if (abortRef.current) abortRef.current.abort();
      setSuggestions([]);
      setLoading(false);
      setError(null);
      setResolvedQuery('');
      return;
    }

    if (abortRef.current) abortRef.current.abort();
    setSuggestions([]);
    setLoading(true);
    setError(null);
    setResolvedQuery('');

    const handle = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const params = new URLSearchParams({
          search: normalized,
          page: '1',
          limit: '8',
          sortBy: 'last_activity_date',
          sortOrder: 'DESC',
        });
        const res = await fetch(`/api/clients?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const payload = await res.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!res.ok) {
          throw new Error(payload?.error || 'Nu am putut cauta clientii existenti.');
        }
        const rows = Array.isArray(payload?.clients) ? payload.clients : [];
        setSuggestions(
          rows.map((item: any) => ({
            id: Number(item.id),
            name: String(item.name || ''),
            email: item.email ? String(item.email) : null,
            phone: item.phone ? String(item.phone) : null,
          }))
        );
        setResolvedQuery(normalized);
      } catch (err) {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setError(err instanceof Error ? err.message : 'Nu am putut cauta clientii existenti.');
        setResolvedQuery(normalized);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(handle);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [isOpen, query, minChars, debounceMs]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const normalized = query.trim().toLowerCase();
  const exactMatches = useMemo(
    () => (
      normalized
        ? suggestions.filter((suggestion) => suggestion.name.trim().toLowerCase() === normalized)
        : []
    ),
    [normalized, suggestions]
  );
  const hasExactNameMatch = exactMatches.length > 0;
  const exactMatch = exactMatches.length === 1 ? exactMatches[0] : null;

  return {
    suggestions,
    loading,
    error,
    resolvedQuery,
    hasExactNameMatch,
    exactMatch,
  };
}
