import { useCallback } from 'react';
import useSWR from 'swr';
import { addDays, endOfDay, endOfMonth, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import type { AvailabilityBlock, CalendarViewType } from './useCalendar';
import { buildAvailabilityBlocksCacheKey } from '../lib/availability-blocks-cache';

interface UseAvailabilityBlocksOptions {
  currentDate: Date;
  viewType: CalendarViewType;
  rangeStartDate?: Date;
  rangeEndDate?: Date;
  calendarIds?: number[];
  initialBlocks?: AvailabilityBlock[];
  initialBlocksCacheKey?: string | null;
}

interface AvailabilityBlockInput {
  typeLabel: string;
  reason?: string | null;
  startTime: string;
  endTime: string;
  allDay?: boolean;
}

interface AvailabilityBlockResult {
  ok: boolean;
  status: number;
  error?: string;
  block?: AvailabilityBlock;
  warning?: string | null;
  overlappingAppointments?: any[];
}

function normalizeCalendarIds(calendarIds?: number[]): number[] | undefined {
  if (!Array.isArray(calendarIds)) return undefined;
  return Array.from(new Set(calendarIds.filter((id): id is number => Number.isInteger(id) && id > 0))).sort((a, b) => a - b);
}

function extractApiError(payload: any, fallback: string): string {
  if (payload?.error && typeof payload.error === 'string') return payload.error;
  if (Array.isArray(payload?.details) && typeof payload.details[0]?.message === 'string') return payload.details[0].message;
  return fallback;
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(extractApiError(payload, 'Nu am putut încărca blocajele.'));
  return Array.isArray(payload?.blocks) ? payload.blocks as AvailabilityBlock[] : [];
};

export function useAvailabilityBlocks({
  currentDate,
  viewType,
  rangeStartDate,
  rangeEndDate,
  calendarIds,
  initialBlocks,
  initialBlocksCacheKey,
}: UseAvailabilityBlocksOptions) {
  const normalizedCalendarIds = normalizeCalendarIds(calendarIds);
  const skipFetchBecauseNoVisibleCalendars = Array.isArray(calendarIds) && (normalizedCalendarIds?.length || 0) === 0;

  let startDate: Date;
  let endDate: Date;
  if (rangeStartDate && rangeEndDate) {
    startDate = startOfDay(rangeStartDate);
    endDate = endOfDay(rangeEndDate);
  } else if (viewType === 'day') {
    startDate = startOfDay(currentDate);
    endDate = endOfDay(currentDate);
  } else if (viewType === 'week' || viewType === 'workweek') {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    startDate = startOfDay(weekStart);
    endDate = endOfDay(addDays(weekStart, viewType === 'workweek' ? 4 : 6));
  } else {
    startDate = startOfDay(startOfMonth(currentDate));
    endDate = endOfDay(endOfMonth(currentDate));
  }

  const computedUrl = buildAvailabilityBlocksCacheKey({ startDate, endDate, calendarIds: normalizedCalendarIds });
  const url = !skipFetchBecauseNoVisibleCalendars ? computedUrl : null;
  const hasMatchingInitialBlocks = Boolean(url && initialBlocksCacheKey === url && initialBlocks);
  const { data = [], error, isLoading, mutate } = useSWR<AvailabilityBlock[]>(url, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    fallbackData: hasMatchingInitialBlocks ? initialBlocks : undefined,
    revalidateOnMount: !hasMatchingInitialBlocks,
    revalidateIfStale: !hasMatchingInitialBlocks,
  });

  const createBlock = useCallback(async (input: AvailabilityBlockInput): Promise<AvailabilityBlockResult> => {
    const response = await fetch('/api/availability-blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, status: response.status, error: extractApiError(payload, 'Nu am putut salva blocajul.') };
    }
    if (payload?.block) {
      mutate((current) => [...(current || []), payload.block], { revalidate: false });
    } else {
      await mutate();
    }
    return {
      ok: true,
      status: response.status,
      block: payload?.block,
      warning: typeof payload?.warning === 'string' ? payload.warning : null,
      overlappingAppointments: Array.isArray(payload?.overlappingAppointments) ? payload.overlappingAppointments : [],
    };
  }, [mutate]);

  const updateBlock = useCallback(async (id: number, input: Partial<AvailabilityBlockInput>): Promise<AvailabilityBlockResult> => {
    const response = await fetch(`/api/availability-blocks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { ok: false, status: response.status, error: extractApiError(payload, 'Nu am putut salva blocajul.') };
    }
    if (payload?.block) {
      mutate((current) => (current || []).map((block) => block.id === id ? payload.block : block), { revalidate: false });
    } else {
      await mutate();
    }
    return {
      ok: true,
      status: response.status,
      block: payload?.block,
      warning: typeof payload?.warning === 'string' ? payload.warning : null,
      overlappingAppointments: Array.isArray(payload?.overlappingAppointments) ? payload.overlappingAppointments : [],
    };
  }, [mutate]);

  const deleteBlock = useCallback(async (id: number): Promise<AvailabilityBlockResult> => {
    const snapshot = data;
    mutate(data.filter((block) => block.id !== id), { revalidate: false });
    const response = await fetch(`/api/availability-blocks/${id}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      mutate(snapshot, { revalidate: false });
      return { ok: false, status: response.status, error: extractApiError(payload, 'Nu am putut șterge blocajul.') };
    }
    return { ok: true, status: response.status };
  }, [data, mutate]);

  return {
    blocks: data,
    loading: isLoading,
    error: error ? error.message : null,
    refetch: mutate,
    createBlock,
    updateBlock,
    deleteBlock,
  };
}
