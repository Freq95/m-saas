import { useCallback } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { startOfWeek, addDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import type { Appointment, CalendarViewType } from './useCalendar';
import { logger } from '@/lib/logger';

interface UseAppointmentsOptions {
  currentDate: Date;
  viewType: CalendarViewType;
  rangeStartDate?: Date;
  rangeEndDate?: Date;
  userId?: number;
  calendarIds?: number[];
  search?: string;
  initialAppointments?: Appointment[];
  initialAppointmentsAreFresh?: boolean;
}

interface UseAppointmentsResult {
  appointments: Appointment[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createAppointment: (data: CreateAppointmentInput) => Promise<CreateAppointmentResult>;
  updateAppointment: (id: number, data: UpdateAppointmentInput) => Promise<UpdateAppointmentResult>;
  deleteAppointment: (id: number, scope?: 'series') => Promise<DeleteAppointmentResult>;
}

export interface CreateAppointmentInput {
  dentistUserId?: number;
  /** Legacy single-service input (back-compat). Prefer `serviceIds`. */
  serviceId?: number;
  /** Multi-service: ordered array of service IDs. At least one of
   *  `serviceId` / `serviceIds` must be provided. */
  serviceIds?: number[];
  clientId?: number | null;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  forceNewClient?: boolean;
  startTime: string;
  endTime: string;
  notes?: string;
  category?: string | null;
  categoryId?: number | null;
  color?: string;
  calendarId?: number;
}

export interface UpdateAppointmentInput {
  startTime?: string;
  endTime?: string;
  dentistUserId?: number;
  /** Legacy single-service input (back-compat). Prefer `serviceIds`. */
  serviceId?: number;
  /** Multi-service: ordered array of service IDs. Replaces the existing set. */
  serviceIds?: number[];
  clientId?: number | null;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  forceNewClient?: boolean;
  status?: string;
  notes?: string;
  category?: string | null;
  categoryId?: number | null;
  color?: string | null;
  /** Scope of an edit when this appointment belongs to a recurring series. */
  scope?: 'this' | 'series';
}

interface ConflictItem {
  type: string;
  message: string;
}

interface ConflictSuggestion {
  startTime: string;
  endTime: string;
  reason: string;
}

interface UpdateAppointmentResult {
  ok: boolean;
  status: number;
  error?: string;
  conflicts?: ConflictItem[];
  suggestions?: ConflictSuggestion[];
  warning?: string | null;
}

interface CreateAppointmentResult {
  ok: boolean;
  status: number;
  error?: string;
  conflicts?: ConflictItem[];
  suggestions?: ConflictSuggestion[];
  warning?: string | null;
}

interface DeleteAppointmentResult {
  ok: boolean;
  status: number;
  error?: string;
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' });

  if (response.status === 401) {
    window.location.href = '/login';
    throw new Error('Sesiune expirata.');
  }

  let payload: { appointments?: Appointment[]; error?: string; details?: unknown } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(extractApiError(payload, `Request failed: ${response.status}`));
  }

  return payload?.appointments || [];
};

function extractApiError(payload: any, fallback: string): string {
  if (
    payload?.error === 'Invalid input' &&
    Array.isArray(payload?.details) &&
    payload.details.length > 0 &&
    typeof payload.details[0]?.message === 'string'
  ) {
    return payload.details[0].message;
  }

  if (payload?.error && typeof payload.error === 'string') {
    return payload.error;
  }

  if (payload?.details) {
    if (typeof payload.details === 'string') {
      return payload.details;
    }
    if (Array.isArray(payload.details) && payload.details.length > 0) {
      const first = payload.details[0];
      if (typeof first?.message === 'string') {
        return first.message;
      }
    }
  }

  return fallback;
}

function normalizeCalendarIds(calendarIds?: number[]): number[] | undefined {
  if (!Array.isArray(calendarIds)) {
    return undefined;
  }

  return Array.from(
    new Set(calendarIds.filter((id): id is number => Number.isInteger(id) && id > 0))
  ).sort((a, b) => a - b);
}

/**
 * Hook for managing appointments with SWR caching.
 */
export function useAppointmentsSWR({
  currentDate,
  viewType,
  rangeStartDate,
  rangeEndDate,
  userId,
  calendarIds,
  search,
  initialAppointments = [],
  initialAppointmentsAreFresh = true,
}: UseAppointmentsOptions): UseAppointmentsResult {
  const effectiveUserId = userId;
  const normalizedCalendarIds = normalizeCalendarIds(calendarIds);
  const skipFetchBecauseNoVisibleCalendars = Array.isArray(calendarIds) && (normalizedCalendarIds?.length || 0) === 0;

  let startDate: Date;
  let endDate: Date;
  const trimmedSearch = search?.trim();
  const isGlobalSearch = Boolean(trimmedSearch);

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

  const queryParams = new URLSearchParams();

  if (!isGlobalSearch) {
    queryParams.set('startDate', startDate.toISOString());
    queryParams.set('endDate', endDate.toISOString());
  }

  if (normalizedCalendarIds && normalizedCalendarIds.length > 0) {
    queryParams.set('calendarIds', normalizedCalendarIds.join(','));
  }

  if (trimmedSearch) {
    queryParams.append('search', trimmedSearch);
  }

  // Calendar UI surfaces cancelled appointments in the right-side panel
  // (strikethrough + dimmed). The grid views filter them out client-side
  // via `gridAppointments` in CalendarPageClient.
  queryParams.set('includeCancelled', 'true');

  const isReady = Boolean(effectiveUserId);
  const url = isReady && !skipFetchBecauseNoVisibleCalendars
    ? `/api/appointments?${queryParams.toString()}`
    : null;
  const {
    data: appointments = [],
    error,
    isLoading,
    mutate,
  } = useSWR<Appointment[]>(url, fetcher, {
    fallbackData: isGlobalSearch || skipFetchBecauseNoVisibleCalendars
      ? []
      : initialAppointmentsAreFresh
        ? initialAppointments
        : undefined,
    keepPreviousData: true,
    revalidateOnFocus: true,
    focusThrottleInterval: 300_000,
    dedupingInterval: 60_000,
    // Skip mount revalidation only when SSR returned data for this exact range.
    // Month view can restore from localStorage while the server preloaded only
    // the week, so callers mark that fallback as stale and we fetch on mount.
    revalidateOnMount: isGlobalSearch || !initialAppointmentsAreFresh,
    revalidateOnReconnect: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  });

  // Global SWR mutator so we can invalidate every `/api/appointments` key,
  // not just the current week's. Required for series edits: when the user
  // picks scope='series' on a multi-week series, the bound `mutate()`
  // refreshes only the visible week. Siblings on other weeks stay stale in
  // the SWR cache and flash old data the next time the user navigates to
  // them. Hitting every appointments key keeps things coherent across views.
  const { mutate: globalMutate } = useSWRConfig();

  const refetch = useCallback(async () => {
    await Promise.all([
      mutate(),
      globalMutate(
        (key) => typeof key === 'string' && key.startsWith('/api/appointments'),
        undefined,
        { revalidate: true }
      ),
    ]);
  }, [mutate, globalMutate]);

  const createAppointment = useCallback(
    async (data: CreateAppointmentInput): Promise<CreateAppointmentResult> => {
      if (!effectiveUserId) {
        return { ok: false, status: 401, error: 'Sesiune invalida. Reautentifica-te.' };
      }

      try {
        const response = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (response.status === 401) {
          window.location.href = '/login';
          return { ok: false, status: response.status, error: 'Sesiune expirata.' };
        }

        if (!response.ok) {
          let errorData: any = null;
          try {
            errorData = await response.json();
          } catch {
            errorData = null;
          }

          const logPayload = {
            status: response.status,
            errorData,
          };

          logger.error('Calendar hook: create appointment API error', logPayload);

          return {
            ok: false,
            status: response.status,
            error: extractApiError(errorData, 'Nu s-a putut crea programarea.'),
          };
        }

        let resultData: any = null;
        try {
          resultData = await response.json();
        } catch {
          resultData = null;
        }

        // Skip the round-trip refetch: the server returned the new appointment
        // doc, so insert it directly into the SWR cache. Saves 150-250ms of
        // perceived wait. We still mark the cache for background revalidation
        // (without await) to pick up server-derived fields like
        // dentist_display_name that aren't in the immediate response.
        const newAppointment = resultData?.appointment as Appointment | undefined;
        if (newAppointment && typeof newAppointment.id === 'number') {
          mutate(
            (current) => {
              const existing = current ?? appointments;
              if (existing.some((apt) => apt.id === newAppointment.id)) return existing;
              return [...existing, newAppointment];
            },
            { revalidate: false }
          );
          // No background refetch — same race risk as updateAppointment: the
          // revalidateTag from POST may not have propagated yet, so an
          // immediate /api/appointments fetch can return stale data without
          // our new appointment and visibly drop it from the calendar.
          // The next explicit revalidation or navigation will reconcile.
        } else {
          // Fallback: server response missing the appointment payload, refetch to be safe.
          await mutate();
        }

        return {
          ok: true,
          status: response.status,
          warning: typeof resultData?.warning === 'string' ? resultData.warning : null,
          conflicts: Array.isArray(resultData?.conflicts) ? resultData.conflicts : [],
          suggestions: Array.isArray(resultData?.suggestions) ? resultData.suggestions : [],
        };
      } catch (err) {
        logger.error('Calendar hook: failed to create appointment', err instanceof Error ? err : new Error(String(err)));
        return { ok: false, status: 0, error: 'Eroare de retea la crearea programarii.' };
      }
    },
    [appointments, effectiveUserId, mutate]
  );

  const updateAppointment = useCallback(
    async (id: number, data: UpdateAppointmentInput): Promise<UpdateAppointmentResult> => {
      // Optimistic update for fields that don't require server-side derivation
      // (service_name, dentist_display_name, etc. need a refetch).
      const hasOptimisticFields = Boolean(
        (data.startTime && data.endTime) ||
        data.status ||
        data.notes !== undefined ||
        data.category !== undefined ||
        data.color
      );
      let snapshot: Appointment[] | undefined;
      if (hasOptimisticFields) {
        snapshot = appointments;
        mutate(
          appointments.map((apt) =>
            apt.id === id
              ? {
                  ...apt,
                  ...(data.startTime && data.endTime ? { start_time: data.startTime, end_time: data.endTime } : {}),
                  ...(data.status ? { status: data.status } : {}),
                  ...(data.notes !== undefined ? { notes: data.notes } : {}),
                  ...(data.category !== undefined ? { category: data.category ?? undefined } : {}),
                  ...(data.color ? { color: data.color } : {}),
                }
              : apt
          ),
          { revalidate: false }
        );
      }

      try {
        const response = await fetch(`/api/appointments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        let errorData: any = null;
        if (response.status === 401) {
          if (snapshot) {
            mutate(snapshot, { revalidate: false });
          }
          window.location.href = '/login';
          return { ok: false, status: response.status, error: 'Sesiune expirata.' };
        }

        if (!response.ok) {
          try {
            errorData = await response.json();
          } catch {
            errorData = null;
          }
        }

        if (!response.ok) {
          if (response.status === 409) {
            if (snapshot) {
              mutate(snapshot, { revalidate: false });
            }
            const conflicts = errorData?.conflicts || [];
            const suggestions = errorData?.suggestions || [];
            logger.warn('Calendar hook: update appointment conflict', {
              status: response.status,
              appointmentId: id,
              conflictsCount: conflicts.length,
              suggestionsCount: suggestions.length,
            });
            return {
              ok: false,
              status: response.status,
              error: extractApiError(errorData, 'Intervalul ales intra in conflict.'),
              conflicts,
              suggestions,
            };
          }

          logger.error('Calendar hook: update appointment API error', {
            status: response.status,
            appointmentId: id,
            errorData,
          });
          return {
            ok: false,
            status: response.status,
            error: extractApiError(errorData, 'Nu s-a putut actualiza programarea.'),
          };
        }

        let resultData: any = null;
        try {
          resultData = await response.json();
        } catch {
          resultData = null;
        }

        // Use the server's authoritative response as the new cache value and
        // DO NOT trigger any refetch. A refetch here would go through
        // /api/appointments → getCached → unstable_cache, which on Vercel can
        // return the previous cached payload for several seconds after the
        // freshly-issued revalidateTag (the tag invalidation is eventually
        // consistent). That stale payload then overwrites the optimistic
        // update and the appointment visibly "bounces back". The next explicit
        // revalidation or navigation will reconcile any unrelated changes.
        const updatedAppointment = resultData?.appointment as Appointment | undefined;
        if (updatedAppointment && typeof updatedAppointment.id === 'number') {
          mutate(
            (current) => (current ?? appointments).map((apt) =>
              apt.id === updatedAppointment.id ? { ...apt, ...updatedAppointment } : apt
            ),
            { revalidate: false }
          );
        } else {
          // Defensive: response missing appointment doc — fall back to refetch.
          await mutate();
        }

        return {
          ok: true,
          status: response.status,
          warning: typeof resultData?.warning === 'string' ? resultData.warning : null,
          conflicts: Array.isArray(resultData?.conflicts) ? resultData.conflicts : [],
          suggestions: Array.isArray(resultData?.suggestions) ? resultData.suggestions : [],
        };
      } catch (err) {
        if (snapshot) {
          mutate(snapshot, { revalidate: false });
        }
        logger.error('Calendar hook: failed to update appointment', err instanceof Error ? err : new Error(String(err)), {
          appointmentId: id,
        });
        return { ok: false, status: 0, error: 'Eroare de retea la actualizarea programarii.' };
      }
    },
    [appointments, mutate]
  );

  const deleteAppointment = useCallback(
    async (id: number, scope?: 'series'): Promise<DeleteAppointmentResult> => {
      const snapshot = appointments;
      // For series deletes, optimistically drop every appointment in the same
      // recurrence_group_id from the cache. Roll back to `snapshot` on error.
      const target = appointments.find((apt) => apt.id === id);
      const seriesGroupId = scope === 'series' ? target?.recurrence_group_id : undefined;
      mutate(
        appointments.filter((apt) =>
          seriesGroupId
            ? apt.recurrence_group_id !== seriesGroupId
            : apt.id !== id
        ),
        { revalidate: false }
      );

      try {
        const queryString = scope ? `?scope=${scope}` : '';
        const response = await fetch(`/api/appointments/${id}${queryString}`, {
          method: 'DELETE',
        });

        if (response.status === 401) {
          mutate(snapshot, { revalidate: false });
          window.location.href = '/login';
          return { ok: false, status: response.status, error: 'Sesiune expirata.' };
        }

        if (!response.ok) {
          let errorData: any = null;
          try {
            errorData = await response.json();
          } catch {
            errorData = null;
          }

          mutate(snapshot, { revalidate: false });
          logger.error('Calendar hook: delete appointment API error', {
            status: response.status,
            appointmentId: id,
            errorData,
          });
          return {
            ok: false,
            status: response.status,
            error: extractApiError(errorData, 'Nu s-a putut sterge programarea.'),
          };
        }

        await mutate();
        return { ok: true, status: response.status };
      } catch (err) {
        mutate(snapshot, { revalidate: false });
        logger.error('Calendar hook: failed to delete appointment', err instanceof Error ? err : new Error(String(err)), {
          appointmentId: id,
        });
        return { ok: false, status: 0, error: 'Eroare de retea la stergerea programarii.' };
      }
    },
    [appointments, mutate]
  );

  return {
    appointments,
    loading: isLoading,
    error: error ? error.message : null,
    refetch,
    createAppointment,
    updateAppointment,
    deleteAppointment,
  };
}
