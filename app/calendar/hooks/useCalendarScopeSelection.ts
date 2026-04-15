import { useEffect, useState } from 'react';

export type CalendarScope = 'all' | number;

interface UseCalendarScopeSelectionOptions {
  storageKey: string;
  calendarsLoading: boolean;
  validCalendarIds: number[];
}

export function useCalendarScopeSelection({
  storageKey,
  calendarsLoading,
  validCalendarIds,
}: UseCalendarScopeSelectionOptions) {
  const [selectedCalendarScope, setSelectedCalendarScope] = useState<CalendarScope>('all');
  const [calendarScopeInitialized, setCalendarScopeInitialized] = useState(false);

  useEffect(() => {
    if (calendarsLoading) {
      return;
    }

    const validCalendarIdSet = new Set(validCalendarIds);

    if (!calendarScopeInitialized) {
      let nextScope: CalendarScope = 'all';

      if (typeof window !== 'undefined') {
        const rawScope = window.localStorage.getItem(storageKey);
        const parsedScope = Number.parseInt(rawScope || '', 10);
        if (rawScope === 'all') {
          nextScope = 'all';
        } else if (Number.isInteger(parsedScope) && parsedScope > 0 && validCalendarIdSet.has(parsedScope)) {
          nextScope = parsedScope;
        }
      }

      setSelectedCalendarScope(nextScope);
      setCalendarScopeInitialized(true);
      return;
    }

    if (selectedCalendarScope !== 'all' && !validCalendarIdSet.has(selectedCalendarScope)) {
      setSelectedCalendarScope('all');
    }
  }, [
    calendarScopeInitialized,
    calendarsLoading,
    selectedCalendarScope,
    storageKey,
    validCalendarIds,
  ]);

  useEffect(() => {
    if (!calendarScopeInitialized || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      storageKey,
      selectedCalendarScope === 'all' ? 'all' : String(selectedCalendarScope)
    );
  }, [calendarScopeInitialized, selectedCalendarScope, storageKey]);

  return {
    selectedCalendarScope,
    setSelectedCalendarScope,
    calendarScopeInitialized,
  };
}
