import { useState, useEffect, useCallback, useRef } from 'react';
import { startOfWeek, addDays, startOfMonth, endOfMonth } from 'date-fns';
import type { Appointment } from './useCalendar';

interface UseAppointmentsOptions {
  currentDate: Date;
  viewType: 'week' | 'month';
  userId?: number; // Made optional - will be from auth later
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

export function useAppointments({
  currentDate,
  viewType,
  userId = 1, // Hardcoded for now, will be from auth
  providerId,
  resourceId,
}: UseAppointmentsOptions): UseAppointmentsResult {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipInitialFetch = useRef(true);

  const fetchAppointments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

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

      const response = await fetch(`/api/appointments?${queryParams.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch appointments');
      }

      const result = await response.json();
      setAppointments(result.appointments || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error fetching appointments:', err);
    } finally {
      setLoading(false);
    }
  }, [currentDate, viewType, userId, providerId, resourceId]);

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    fetchAppointments();
  }, [fetchAppointments]);

  const createAppointment = useCallback(
    async (data: CreateAppointmentInput): Promise<boolean> => {
      try {
        setError(null);
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
          throw new Error(errorData.error || 'Failed to create appointment');
        }

        await fetchAppointments(); // Refetch after creation
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        console.error('Error creating appointment:', err);
        return false;
      }
    },
    [userId, fetchAppointments]
  );

  const updateAppointment = useCallback(
    async (id: number, data: UpdateAppointmentInput): Promise<boolean> => {
      try {
        setError(null);
        const response = await fetch(`/api/appointments/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update appointment');
        }

        await fetchAppointments(); // Refetch after update
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        console.error('Error updating appointment:', err);
        return false;
      }
    },
    [fetchAppointments]
  );

  const deleteAppointment = useCallback(
    async (id: number): Promise<boolean> => {
      try {
        setError(null);
        const response = await fetch(`/api/appointments/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete appointment');
        }

        await fetchAppointments(); // Refetch after deletion
        return true;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMessage);
        console.error('Error deleting appointment:', err);
        return false;
      }
    },
    [fetchAppointments]
  );

  return {
    appointments,
    loading,
    error,
    refetch: fetchAppointments,
    createAppointment,
    updateAppointment,
    deleteAppointment,
  };
}

export type { CreateAppointmentInput, UpdateAppointmentInput };
