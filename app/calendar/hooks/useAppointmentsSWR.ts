import { useCallback } from 'react';
import useSWR from 'swr';
import { startOfWeek, addDays, startOfMonth, endOfMonth } from 'date-fns';
import type { Appointment } from './useCalendar';

interface UseAppointmentsOptions {
  currentDate: Date;
  viewType: 'week' | 'month';
  userId?: number;
  providerId?: number;
  resourceId?: number;
}

interface UseAppointmentsResult {
  appointments: Appointment[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createAppointment: (data: CreateAppointmentInput) => Promise<boolean>;
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
  userId = 1,
  providerId,
  resourceId,
}: UseAppointmentsOptions): UseAppointmentsResult {
  // Calculate date range
  let startDate: Date;
  let endDate: Date;

  if (viewType === 'week') {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    startDate = weekStart;
    endDate = addDays(weekStart, 6);
  } else {
    const monthStart = startOfMonth(currentDate);
    startDate = monthStart;
    endDate = endOfMonth(currentDate);
  }

  // Build query string
  const queryParams = new URLSearchParams({
    userId: userId.toString(),
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  if (providerId) {
    queryParams.append('providerId', providerId.toString());
  }

  if (resourceId) {
    queryParams.append('resourceId', resourceId.toString());
  }

  const url = `/api/appointments?${queryParams.toString()}`;

  // Use SWR with caching configuration
  const {
    data: appointments = [],
    error,
    isLoading,
    mutate,
  } = useSWR<Appointment[]>(url, fetcher, {
    revalidateOnFocus: false, // Don't refetch when window regains focus
    dedupingInterval: 10000, // 10 seconds deduplication
    revalidateOnReconnect: true, // Refetch when reconnecting
    refreshInterval: 0, // No polling (use manual refetch)
  });

  const refetch = useCallback(async () => {
    await mutate();
  }, [mutate]);

  const createAppointment = useCallback(
    async (data: CreateAppointmentInput): Promise<boolean> => {
      try {
        const response = await fetch('/api/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            ...data,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('Create appointment error:', errorData);
          return false;
        }

        // Optimistically update cache
        await mutate();
        return true;
      } catch (err) {
        console.error('Error creating appointment:', err);
        return false;
      }
    },
    [userId, mutate]
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
          console.error('Update appointment error:', errorData);
          return false;
        }

        // Optimistically update cache
        await mutate();
        return true;
      } catch (err) {
        console.error('Error updating appointment:', err);
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
          console.error('Delete appointment error:', errorData);
          return false;
        }

        // Optimistically update cache
        await mutate();
        return true;
      } catch (err) {
        console.error('Error deleting appointment:', err);
        return false;
      }
    },
    [mutate]
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

export type { CreateAppointmentInput, UpdateAppointmentInput };
