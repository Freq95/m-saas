import { useCallback } from 'react';
import useSWR from 'swr';
import { startOfWeek, addDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { useSession } from 'next-auth/react';
import type { Appointment, CalendarViewType } from './useCalendar';
import { logger } from '@/lib/logger';
import { parseSessionUserId } from './sessionUser';

interface UseAppointmentsOptions {
  currentDate: Date;
  viewType: CalendarViewType;
  userId?: number;
  calendarIds?: number[];
  providerId?: number;
  resourceId?: number;
  search?: string;
  initialAppointments?: Appointment[];
}

interface UseAppointmentsResult {
  appointments: Appointment[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createAppointment: (data: CreateAppointmentInput) => Promise<{ ok: boolean; error?: string }>;
  updateAppointment: (id: number, data: UpdateAppointmentInput) => Promise<UpdateAppointmentResult>;
  deleteAppointment: (id: number) => Promise<DeleteAppointmentResult>;
}

interface CreateAppointmentInput {
  dentistUserId?: number;
  serviceId: number;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  forceNewClient?: boolean;
  startTime: string;
  endTime: string;
  notes?: string;
  providerId?: number;
  resourceId?: number;
  category?: string;
  color?: string;
  calendarId?: number;
}

interface UpdateAppointmentInput {
  startTime?: string;
  endTime?: string;
  status?: string;
  notes?: string;
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
  userId,
  calendarIds,
  providerId,
  resourceId,
  search,
  initialAppointments = [],
}: UseAppointmentsOptions): UseAppointmentsResult {
  const { data: session, status } = useSession();
  const sessionUserId = parseSessionUserId(session);
  const effectiveUserId = userId ?? sessionUserId;
  const normalizedCalendarIds = normalizeCalendarIds(calendarIds);
  const skipFetchBecauseNoVisibleCalendars = Array.isArray(calendarIds) && (normalizedCalendarIds?.length || 0) === 0;

  let startDate: Date;
  let endDate: Date;
  const trimmedSearch = search?.trim();
  const isGlobalSearch = Boolean(trimmedSearch);

  if (viewType === 'day') {
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

  if (providerId) {
    queryParams.append('providerId', providerId.toString());
  }

  if (resourceId) {
    queryParams.append('resourceId', resourceId.toString());
  }

  if (trimmedSearch) {
    queryParams.append('search', trimmedSearch);
  }

  const isReady = status !== 'loading' && Boolean(effectiveUserId);
  const url = isReady && !skipFetchBecauseNoVisibleCalendars
    ? `/api/appointments?${queryParams.toString()}`
    : null;
  const refreshInterval = !isReady || isGlobalSearch || skipFetchBecauseNoVisibleCalendars
    ? 0
    : 20_000;

  const {
    data: appointments = [],
    error,
    isLoading,
    mutate,
  } = useSWR<Appointment[]>(url, fetcher, {
    fallbackData: isGlobalSearch || skipFetchBecauseNoVisibleCalendars ? [] : initialAppointments,
    keepPreviousData: true,
    revalidateOnFocus: true,
    focusThrottleInterval: 10_000,
    dedupingInterval: 10_000,
    revalidateOnReconnect: true,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    refreshInterval,
  });

  const refetch = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const createAppointment = useCallback(
    async (data: CreateAppointmentInput): Promise<{ ok: boolean; error?: string }> => {
      if (!effectiveUserId) {
        return { ok: false, error: 'Sesiune invalida. Reautentifica-te.' };
      }

      try {
        const response = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (response.status === 401) {
          window.location.href = '/login';
          return { ok: false, error: 'Sesiune expirata.' };
        }

        if (!response.ok) {
          let errorData: any = null;
          try {
            errorData = await response.json();
          } catch {
            errorData = null;
          }

          const isAvailabilityError =
            response.status === 400 &&
            typeof errorData?.error === 'string' &&
            errorData.error.toLowerCase().includes('time slot is not available');
          const logPayload = {
            status: response.status,
            errorData,
          };

          if (isAvailabilityError) {
            logger.warn('Calendar hook: create appointment slot unavailable', logPayload);
          } else {
            logger.error('Calendar hook: create appointment API error', logPayload);
          }

          return {
            ok: false,
            error: isAvailabilityError
              ? 'Intervalul selectat nu este disponibil. Alege un alt interval.'
              : extractApiError(errorData, 'Nu s-a putut crea programarea.'),
          };
        }

        await mutate();
        return { ok: true };
      } catch (err) {
        logger.error('Calendar hook: failed to create appointment', err instanceof Error ? err : new Error(String(err)));
        return { ok: false, error: 'Eroare de retea la crearea programarii.' };
      }
    },
    [effectiveUserId, mutate]
  );

  const updateAppointment = useCallback(
    async (id: number, data: UpdateAppointmentInput): Promise<UpdateAppointmentResult> => {
      let snapshot: Appointment[] | undefined;
      if (data.startTime && data.endTime) {
        snapshot = appointments;
        mutate(
          appointments.map((apt) =>
            apt.id === id
              ? { ...apt, start_time: data.startTime!, end_time: data.endTime! }
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

        await mutate();
        return {
          ok: true,
          status: response.status,
          warning: typeof resultData?.warning === 'string' ? resultData.warning : null,
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
    async (id: number): Promise<DeleteAppointmentResult> => {
      const snapshot = appointments;
      mutate(
        appointments.filter((apt) => apt.id !== id),
        { revalidate: false }
      );

      try {
        const response = await fetch(`/api/appointments/${id}`, {
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
    loading: status === 'loading' || isLoading,
    error: error ? error.message : null,
    refetch,
    createAppointment,
    updateAppointment,
    deleteAppointment,
  };
}

export type { CreateAppointmentInput, UpdateAppointmentInput };
