'use client';

import { useState, useEffect } from 'react';
import { isSameDay } from 'date-fns';
import styles from './page.module.css';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';
import { useCalendar, useAppointments } from './hooks';
import {
  CalendarHeader,
  WeekView,
  MonthView,
  CreateAppointmentModal,
  AppointmentPreviewModal,
  EditAppointmentModal,
  DeleteConfirmModal,
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

  const [services, setServices] = useState<Service[]>(initialServices);
  const [loadingServices, setLoadingServices] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
  }) => {
    if (!state.selectedSlot || !formData.clientName || !formData.serviceId) {
      toast.warning('Completeaza toate campurile obligatorii (nume client si serviciu).');
      return;
    }

    const selectedService = services.find((s) => s.id.toString() === formData.serviceId);
    const durationMinutes = selectedService?.duration_minutes || 60;
    const calculatedEndTime = new Date(state.selectedSlot.start);
    calculatedEndTime.setMinutes(calculatedEndTime.getMinutes() + durationMinutes);

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

    const success = await updateAppointment(state.selectedAppointment.id, {
      startTime: new Date(formData.startTime).toISOString(),
      endTime: new Date(formData.endTime).toISOString(),
      status: formData.status,
      notes: formData.notes,
    });

    if (success) {
      setShowEditModal(false);
      actions.clearSelection();
      toast.success('Programarea a fost actualizata.');
    } else {
      toast.error('Nu s-a putut actualiza programarea.');
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
          onPrevPeriod={actions.prevPeriod}
          onNextPeriod={actions.nextPeriod}
          onTodayClick={actions.goToToday}
          onViewTypeChange={actions.setViewType}
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
            onSlotClick={handleSlotClick}
            onAppointmentClick={handleAppointmentClick}
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

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
