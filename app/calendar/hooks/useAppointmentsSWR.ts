import { useCallback } from 'react';
import useSWR from 'swr';
import { startOfWeek, addDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { useSession } from 'next-auth/react';
import type { Appointment, CalendarViewType } from './useCalendar';
import { logger } from '@/lib/logger';
import { parseSessionUserId } from './sessionUser';
import { authFetcher } from '@/lib/fetcher';

interface UseAppointmentsOptions {
  currentDate: Date;
  viewType: CalendarViewType;
  userId?: number;
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
  deleteAppointment: (id: number) => Promise<boolean>;
}

interface CreateAppointmentInput {
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

// SWR fetcher function
const fetcher = async (url: string) => {
  const result = await authFetcher<{ appointments?: Appointment[] }>(url);
  return result.appointments || [];
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

/**
 * Hook for managing appointments with SWR caching
 *
 * Benefits of SWR:
 * - Automatic revalidation on focus
 * - Deduplication of requests
 * - Optimistic UI updates
 * - Cache persistence
 * - Background revalidation
 */
export function useAppointmentsSWR({
  currentDate,
  viewType,
  userId,
  providerId,
  resourceId,
  search,
  initialAppointments = [],
}: UseAppointmentsOptions): UseAppointmentsResult {
  const { data: session, status } = useSession();
  const sessionUserId = parseSessionUserId(session);
  const effectiveUserId = userId ?? sessionUserId;

  // Calculate date range
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

  // Build query string
  const queryParams = new URLSearchParams({
    userId: String(effectiveUserId || ''),
  });

  if (!isGlobalSearch) {
    queryParams.set('startDate', startDate.toISOString());
    queryParams.set('endDate', endDate.toISOString());
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

  const url = effectiveUserId ? `/api/appointments?${queryParams.toString()}` : null;

  // Use SWR with caching configuration
  const {
    data: appointments = [],
    error,
    isLoading,
    mutate,
  } = useSWR<Appointment[]>(url, fetcher, {
    fallbackData: isGlobalSearch ? [] : initialAppointments,
    keepPreviousData: true,
    revalidateOnFocus: false, // Don't refetch when window regains focus
    dedupingInterval: 10000, // 10 seconds deduplication
    revalidateOnReconnect: true, // Refetch when reconnecting
    refreshInterval: 0, // No polling (use manual refetch)
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
          body: JSON.stringify({
            userId: effectiveUserId,
            ...data,
          }),
        });

        if (response.status === 401 || response.status === 403) {
          window.location.href = '/login';
          return { ok: false, error: 'Sesiune expirata.' };
        }
        if (!response.ok) {
          const errorData = await response.json();
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

        // Optimistically update cache
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
        if (response.status === 401 || response.status === 403) {
          if (snapshot) mutate(snapshot, { revalidate: false });
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
            if (snapshot) mutate(snapshot, { revalidate: false });
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

        // Optimistically update cache
        await mutate();
        return { ok: true, status: response.status, warning: typeof resultData?.warning === 'string' ? resultData.warning : null };
      } catch (err) {
        if (snapshot) mutate(snapshot, { revalidate: false });
        logger.error('Calendar hook: failed to update appointment', err instanceof Error ? err : new Error(String(err)), {
          appointmentId: id,
        });
        return { ok: false, status: 0, error: 'Eroare de retea la actualizarea programarii.' };
      }
    },
    [mutate, appointments]
  );

  const deleteAppointment = useCallback(
    async (id: number): Promise<boolean> => {
      const snapshot = appointments;
      mutate(
        appointments.filter((apt) => apt.id !== id),
        { revalidate: false }
      );

      try {
        const response = await fetch(`/api/appointments/${id}`, {
          method: 'DELETE',
        });

        if (response.status === 401 || response.status === 403) {
          mutate(snapshot, { revalidate: false });
          window.location.href = '/login';
          return false;
        }
        if (!response.ok) {
          const errorData = await response.json();
          mutate(snapshot, { revalidate: false });
          logger.error('Calendar hook: delete appointment API error', {
            status: response.status,
            appointmentId: id,
            errorData,
          });
          return false;
        }

        // Optimistically update cache
        await mutate();
        return true;
      } catch (err) {
        mutate(snapshot, { revalidate: false });
        logger.error('Calendar hook: failed to delete appointment', err instanceof Error ? err : new Error(String(err)), {
          appointmentId: id,
        });
        return false;
      }
    },
    [mutate, appointments]
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
