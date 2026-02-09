'use client';

import { useState, useEffect } from 'react';
import { isSameDay } from 'date-fns';
import styles from './page.module.css';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';
import { useCalendar, useAppointmentsSWR as useAppointments, useProviders, useResources, useBlockedTimes } from './hooks';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import {
  CalendarHeader,
  WeekView,
  MonthView,
  CreateAppointmentModal,
  AppointmentPreviewModal,
  EditAppointmentModal,
  DeleteConfirmModal,
  ConflictWarningModal,
} from './components';
import { useCalendarNavigation } from './hooks/useCalendarNavigation';

interface Service {
  id: number;
  name: string;
  duration_minutes: number;
  price: number;
}

interface CalendarPageClientProps {
  initialAppointments: any[];
  initialServices: Service[];
  initialDate: string;
  initialViewType?: 'week' | 'month';
}

export default function CalendarPageClient({
  initialAppointments,
  initialServices,
  initialDate,
  initialViewType = 'week',
}: CalendarPageClientProps) {
  const toast = useToast();
  const { state, actions } = useCalendar(initialDate, initialViewType);
  const { weekDays, monthDays, rangeLabel, hours } = useCalendarNavigation({
    currentDate: state.currentDate,
    viewType: state.viewType,
  });

  const {
    appointments,
    loading,
    refetch,
    createAppointment,
    updateAppointment,
    deleteAppointment,
  } = useAppointments({
    currentDate: state.currentDate,
    viewType: state.viewType,
    userId: 1, // Will be from auth later
    providerId: state.selectedProvider?.id,
    resourceId: state.selectedResource?.id,
  });

  // Fetch providers and resources
  const { providers } = useProviders(1);
  const { resources } = useResources(1);

  // Calculate date range for blocked times
  const viewStartDate = state.viewType === 'week' ? weekDays[0] : monthDays[0];
  const viewEndDate = state.viewType === 'week' ? weekDays[weekDays.length - 1] : monthDays[monthDays.length - 1];

  // Fetch blocked times for current view
  const { blockedTimes } = useBlockedTimes(
    1,
    state.selectedProvider?.id,
    state.selectedResource?.id,
    viewStartDate,
    viewEndDate
  );

  const [services, setServices] = useState<Service[]>(initialServices);
  const [loadingServices, setLoadingServices] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictData, setConflictData] = useState<{
    conflicts: any[];
    suggestions: any[];
  }>({ conflicts: [], suggestions: [] });

  // Drag-and-drop functionality
  const { draggedAppointment, handleDragStart, handleDragEnd, handleDrop } = useDragAndDrop(
    async (appointmentId, newStartTime, newEndTime) => {
      const success = await updateAppointment(appointmentId, {
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      });

      if (success) {
        toast.success('Programarea a fost mutata.');
      } else {
        toast.error('Nu s-a putut muta programarea. Verifica conflictele.');
      }

      return success;
    }
  );

  // Fetch services if not provided initially
  useEffect(() => {
    if (initialServices.length > 0) return;

    const fetchServices = async () => {
      try {
        setLoadingServices(true);
        const response = await fetch('/api/services?userId=1');
        const result = await response.json();
        setServices(result.services || []);
      } catch (error) {
        console.error('Error fetching services:', error);
        toast.error('Eroare la incarcarea serviciilor.');
      } finally {
        setLoadingServices(false);
      }
    };

    fetchServices();
  }, [initialServices.length, toast]);

  // Keyboard shortcut: ESC to close modals
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowCreateModal(false);
        setShowEditModal(false);
        setShowPreviewModal(false);
        setShowDeleteConfirm(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSlotClick = (day: Date, hour?: number) => {
    const slotStart = new Date(day);
    if (hour !== undefined) {
      slotStart.setHours(hour, 0, 0, 0);
    } else {
      // For month view, default to 9 AM
      slotStart.setHours(9, 0, 0, 0);
    }

    const selectedService = services[0];
    const durationMinutes = selectedService?.duration_minutes || 60;
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

    actions.selectDate(day);
    actions.selectSlot({ start: slotStart, end: slotEnd });
    setShowCreateModal(true);
  };

  const handleQuickCreate = () => {
    const now = new Date();
    const slotStart = new Date(now);
    const roundedMinutes = Math.ceil(slotStart.getMinutes() / 15) * 15;
    slotStart.setMinutes(roundedMinutes, 0, 0);

    if (slotStart.getHours() < 8) {
      slotStart.setHours(8, 0, 0, 0);
    }

    if (slotStart.getHours() >= 19) {
      slotStart.setDate(slotStart.getDate() + 1);
      slotStart.setHours(8, 0, 0, 0);
    }

    const selectedService = services[0];
    const durationMinutes = selectedService?.duration_minutes || 60;
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes);

    actions.selectDate(slotStart);
    actions.selectSlot({ start: slotStart, end: slotEnd });
    setShowCreateModal(true);
  };

  const handleCreateAppointment = async (formData: {
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    serviceId: string;
    notes: string;
    isRecurring?: boolean;
    recurrence?: {
      frequency: 'daily' | 'weekly' | 'monthly';
      interval: number;
      endType: 'date' | 'count';
      endDate?: string;
      count?: number;
    };
  }) => {
    if (!state.selectedSlot || !formData.clientName || !formData.serviceId) {
      toast.warning('Completeaza toate campurile obligatorii (nume client si serviciu).');
      return;
    }

    const selectedService = services.find((s) => s.id.toString() === formData.serviceId);
    const durationMinutes = selectedService?.duration_minutes || 60;
    const calculatedEndTime = new Date(state.selectedSlot.start);
    calculatedEndTime.setMinutes(calculatedEndTime.getMinutes() + durationMinutes);

    // Handle recurring appointments
    if (formData.isRecurring && formData.recurrence) {
      try {
        const response = await fetch('/api/appointments/recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceId: parseInt(formData.serviceId),
            clientName: formData.clientName,
            clientEmail: formData.clientEmail,
            clientPhone: formData.clientPhone,
            startTime: state.selectedSlot.start.toISOString(),
            endTime: calculatedEndTime.toISOString(),
            notes: formData.notes,
            recurrence: {
              frequency: formData.recurrence.frequency,
              interval: formData.recurrence.interval,
              ...(formData.recurrence.endType === 'count'
                ? { count: formData.recurrence.count }
                : { endDate: formData.recurrence.endDate }),
            },
          }),
        });

        const result = await response.json();

        if (response.ok) {
          setShowCreateModal(false);
          actions.clearSelection();
          refetch();
          toast.success(
            `${result.created} programari recurente create${
              result.skipped > 0 ? `, ${result.skipped} omise (conflicte)` : ''
            }.`
          );
        } else {
          toast.error(result.error || 'Nu s-au putut crea programarile recurente.');
        }
      } catch (error) {
        console.error('Error creating recurring appointments:', error);
        toast.error('Eroare la crearea programarilor recurente.');
      }
    } else {
      // Handle single appointment
      const success = await createAppointment({
        serviceId: parseInt(formData.serviceId),
        clientName: formData.clientName,
        clientEmail: formData.clientEmail,
        clientPhone: formData.clientPhone,
        startTime: state.selectedSlot.start.toISOString(),
        endTime: calculatedEndTime.toISOString(),
        notes: formData.notes,
      });

      if (success) {
        setShowCreateModal(false);
        actions.clearSelection();
        toast.success('Programarea a fost creata.');
      } else {
        toast.error('Nu s-a putut crea programarea.');
      }
    }
  };

  const handleAppointmentClick = (appointment: any) => {
    actions.selectAppointment(appointment);
    setShowPreviewModal(true);
  };

  const handleEditClick = async () => {
    if (!state.selectedAppointment) return;

    // Fetch full appointment details
    try {
      const response = await fetch(`/api/appointments/${state.selectedAppointment.id}`);
      const result = await response.json();
      const fullAppointment = result.appointment;

      actions.selectAppointment(fullAppointment);
      setShowPreviewModal(false);
      setShowEditModal(true);
    } catch (error) {
      console.error('Error fetching appointment details:', error);
      setShowPreviewModal(false);
      setShowEditModal(true);
    }
  };

  const handleUpdateAppointment = async (formData: {
    startTime: string;
    endTime: string;
    status: string;
    notes: string;
  }) => {
    if (!state.selectedAppointment) return;

    try {
      const response = await fetch(`/api/appointments/${state.selectedAppointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: new Date(formData.startTime).toISOString(),
          endTime: new Date(formData.endTime).toISOString(),
          status: formData.status,
          notes: formData.notes,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        setShowEditModal(false);
        actions.clearSelection();
        refetch();
        toast.success('Programarea a fost actualizata.');
      } else if (response.status === 409) {
        // Conflict detected
        setConflictData({
          conflicts: result.conflicts || [],
          suggestions: result.suggestions || [],
        });
        setShowConflictModal(true);
      } else {
        toast.error(result.error || 'Nu s-a putut actualiza programarea.');
      }
    } catch (error) {
      console.error('Error updating appointment:', error);
      toast.error('Eroare la actualizarea programarii.');
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    if (!state.selectedAppointment) return;

    const success = await deleteAppointment(state.selectedAppointment.id);

    if (success) {
      setShowPreviewModal(false);
      setShowDeleteConfirm(false);
      actions.clearSelection();
      toast.success('Programarea a fost stearsa.');
    } else {
      toast.error('Nu s-a putut sterge programarea.');
    }
  };

  const handleQuickStatusChange = async (status: string) => {
    if (!state.selectedAppointment) return;

    const success = await updateAppointment(state.selectedAppointment.id, { status });

    if (success) {
      refetch();
      toast.success('Statusul a fost actualizat.');
    } else {
      toast.error('Nu s-a putut actualiza statusul.');
    }
  };

  const today = new Date();
  const appointmentsToday = appointments.filter((apt) =>
    isSameDay(new Date(apt.start_time), today)
  );
  const scheduledToday = appointmentsToday.filter((apt) => apt.status === 'scheduled').length;

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Dental Operations</p>
            <h2 className={styles.heroTitle}>Calendar</h2>
            <p className={styles.heroSubtitle}>
              Programari clare, rapide si predictibile pentru cabinet.
            </p>
          </div>
          <div className={styles.heroMetrics}>
            <div className={styles.metricPill}>
              <span>Astazi</span>
              <strong>{appointmentsToday.length}</strong>
            </div>
            <div className={styles.metricPill}>
              <span>Programate</span>
              <strong>{scheduledToday}</strong>
            </div>
            <button type="button" className={styles.primaryAction} onClick={handleQuickCreate}>
              + Programare rapida
            </button>
          </div>
        </section>

        <CalendarHeader
          rangeLabel={rangeLabel}
          viewType={state.viewType}
          providers={providers}
          resources={resources}
          selectedProviderId={state.selectedProvider?.id || null}
          selectedResourceId={state.selectedResource?.id || null}
          onPrevPeriod={actions.prevPeriod}
          onNextPeriod={actions.nextPeriod}
          onTodayClick={actions.goToToday}
          onViewTypeChange={actions.setViewType}
          onProviderChange={(providerId) => {
            const provider = providers.find((p) => p.id === providerId);
            actions.selectProvider(provider || null);
          }}
          onResourceChange={(resourceId) => {
            const resource = resources.find((r) => r.id === resourceId);
            actions.selectResource(resource || null);
          }}
        />

        {(loading || loadingServices) && (
          <div className="skeleton-stack" style={{ marginBottom: '1rem' }}>
            <div className="skeleton skeleton-line" style={{ height: '16px', width: '220px' }} />
            <div className="skeleton skeleton-line" style={{ height: '14px', width: '140px' }} />
          </div>
        )}

        {state.viewType === 'week' ? (
          <WeekView
            weekDays={weekDays}
            hours={hours}
            appointments={appointments}
            blockedTimes={blockedTimes}
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
            enableDragDrop={true}
            draggedAppointment={draggedAppointment}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={async (day, hour) => {
              await handleDrop(day, hour);
            }}
            providers={providers}
          />
        ) : (
          <MonthView
            monthDays={monthDays}
            currentDate={state.currentDate}
            appointments={appointments}
            onDayClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
          />
        )}
      </main>

      <CreateAppointmentModal
        isOpen={showCreateModal}
        selectedSlot={state.selectedSlot}
        services={services}
        onClose={() => {
          setShowCreateModal(false);
          actions.clearSelection();
        }}
        onCreate={handleCreateAppointment}
      />

      <AppointmentPreviewModal
        isOpen={showPreviewModal}
        appointment={state.selectedAppointment}
        onClose={() => {
          setShowPreviewModal(false);
          actions.clearSelection();
        }}
        onEdit={handleEditClick}
        onDelete={handleDeleteClick}
        onQuickStatusChange={handleQuickStatusChange}
      />

      <EditAppointmentModal
        isOpen={showEditModal}
        appointment={state.selectedAppointment}
        onClose={() => {
          setShowEditModal(false);
          actions.clearSelection();
        }}
        onUpdate={handleUpdateAppointment}
      />

      <DeleteConfirmModal
        isOpen={showDeleteConfirm}
        appointment={state.selectedAppointment}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
      />

      <ConflictWarningModal
        isOpen={showConflictModal}
        conflicts={conflictData.conflicts}
        suggestions={conflictData.suggestions}
        onClose={() => setShowConflictModal(false)}
        onSelectSlot={(startTime, endTime) => {
          // Auto-fill the selected alternative slot
          actions.selectSlot({
            start: new Date(startTime),
            end: new Date(endTime),
          });
          setShowEditModal(true);
        }}
      />

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
