import { useCallback } from 'react';
import useSWR from 'swr';
import { startOfWeek, addDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { useSession } from 'next-auth/react';
import type { Appointment, CalendarViewType } from './useCalendar';
import { logger } from '@/lib/logger';

interface UseAppointmentsOptions {
  currentDate: Date;
  viewType: CalendarViewType;
  userId?: number;
  providerId?: number;
  resourceId?: number;
  initialAppointments?: Appointment[];
}

interface UseAppointmentsResult {
  appointments: Appointment[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createAppointment: (data: CreateAppointmentInput) => Promise<{ ok: boolean; error?: string }>;
  updateAppointment: (id: number, data: UpdateAppointmentInput) => Promise<boolean>;
  deleteAppointment: (id: number) => Promise<boolean>;
}

interface CreateAppointmentInput {
  serviceId: number;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
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

// SWR fetcher function
const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch appointments');
  }
  const result = await response.json();
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
  initialAppointments = [],
}: UseAppointmentsOptions): UseAppointmentsResult {
  const { data: session, status } = useSession();
  const sessionUserId =
    session?.user?.id && /^[1-9]\d*$/.test(session.user.id)
      ? Number.parseInt(session.user.id, 10)
      : null;
  const effectiveUserId = userId ?? sessionUserId;

  // Calculate date range
  let startDate: Date;
  let endDate: Date;

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
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  if (providerId) {
    queryParams.append('providerId', providerId.toString());
  }

  if (resourceId) {
    queryParams.append('resourceId', resourceId.toString());
  }

  const url = effectiveUserId ? `/api/appointments?${queryParams.toString()}` : null;

  // Use SWR with caching configuration
  const {
    data: appointments = [],
    error,
    isLoading,
    mutate,
  } = useSWR<Appointment[]>(url, fetcher, {
    fallbackData: initialAppointments,
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

        if (!response.ok) {
          const errorData = await response.json();
          logger.error('Calendar hook: create appointment API error', {
            status: response.status,
            errorData,
          });
          return {
            ok: false,
            error: extractApiError(errorData, 'Nu s-a putut crea programarea.'),
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
    async (id: number, data: UpdateAppointmentInput): Promise<boolean> => {
      try {
        const response = await fetch(`/api/appointments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          logger.error('Calendar hook: update appointment API error', {
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
        logger.error('Calendar hook: failed to update appointment', err instanceof Error ? err : new Error(String(err)), {
          appointmentId: id,
        });
        return false;
      }
    },
    [mutate]
  );

  const deleteAppointment = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        const response = await fetch(`/api/appointments/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const errorData = await response.json();
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
        logger.error('Calendar hook: failed to delete appointment', err instanceof Error ? err : new Error(String(err)), {
          appointmentId: id,
        });
        return false;
      }
    },
    [mutate]
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
