import { useState, useCallback } from 'react';
import type { Appointment } from './useCalendar';

interface DragData {
  appointment: Appointment;
  sourceDate: Date;
}

interface UseDragAndDropResult {
  draggedAppointment: Appointment | null;
  isDragging: boolean;
  handleDragStart: (appointment: Appointment, sourceDate: Date) => void;
  handleDragEnd: () => void;
  handleDrop: (targetDate: Date, targetHour?: number) => Promise<{ newStart: Date; newEnd: Date } | null>;
}

export function useDragAndDrop(
  onReschedule: (appointmentId: number, newStartTime: Date, newEndTime: Date) => Promise<boolean>
): UseDragAndDropResult {
  const [dragData, setDragData] = useState<DragData | null>(null);

  const handleDragStart = useCallback((appointment: Appointment, sourceDate: Date) => {
    setDragData({ appointment, sourceDate });
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragData(null);
  }, []);

  const handleDrop = useCallback(
    async (targetDate: Date, targetHour?: number): Promise<{ newStart: Date; newEnd: Date } | null> => {
      if (!dragData) return null;

      const { appointment } = dragData;
      const originalStart = new Date(appointment.start_time);
      const originalEnd = new Date(appointment.end_time);
      const duration = originalEnd.getTime() - originalStart.getTime();

      // Calculate new start time
      const newStart = new Date(targetDate);
      if (targetHour !== undefined) {
        newStart.setHours(targetHour, 0, 0, 0);
      } else {
        // Keep the same time, just change the date
        newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
      }

      // Calculate new end time
      const newEnd = new Date(newStart.getTime() + duration);

      // Check if the appointment is being moved to the same slot
      if (
        originalStart.getTime() === newStart.getTime() &&
        originalEnd.getTime() === newEnd.getTime()
      ) {
        setDragData(null);
        return null; // No change needed
      }

      // Attempt to reschedule
      const success = await onReschedule(appointment.id, newStart, newEnd);

      if (success) {
        setDragData(null);
        return { newStart, newEnd };
      }

      // If failed, revert (by not updating)
      setDragData(null);
      return null;
    },
    [dragData, onReschedule]
  );

  return {
    draggedAppointment: dragData?.appointment || null,
    isDragging: dragData !== null,
    handleDragStart,
    handleDragEnd,
    handleDrop,
  };
}
