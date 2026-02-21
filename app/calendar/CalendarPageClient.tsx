'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import styles from './page.module.css';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';
import {
  useCalendar,
  useAppointmentsSWR as useAppointments,
  useProviders,
  useResources,
  useBlockedTimes,
} from './hooks';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import {
  WeekView,
  MonthView,
  DayPanel,
  CreateAppointmentModal,
  AppointmentPreviewModal,
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
  initialViewType?: 'week' | 'workweek' | 'month' | 'day';
}

export default function CalendarPageClient({
  initialAppointments,
  initialServices,
  initialDate,
  initialViewType = 'week',
}: CalendarPageClientProps) {
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [hasFinishedInitialLoad, setHasFinishedInitialLoad] = useState(initialAppointments.length > 0);
  const { data: session } = useSession();
  const sessionUserId =
    session?.user?.id && /^[1-9]\d*$/.test(session.user.id)
      ? Number.parseInt(session.user.id, 10)
      : undefined;
  const { state, actions } = useCalendar(initialDate, initialViewType);
  const { weekDays, monthDays, rangeLabel, hours } = useCalendarNavigation({
    currentDate: state.currentDate,
    viewType: state.viewType,
  });

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const { appointments, loading, refetch, createAppointment, updateAppointment, deleteAppointment } =
    useAppointments({
      currentDate: state.currentDate,
      viewType: state.viewType,
      userId: sessionUserId,
      providerId: state.selectedProvider?.id,
      resourceId: state.selectedResource?.id,
      search: debouncedSearchQuery,
      initialAppointments,
    });

  useEffect(() => {
    if (!loading) {
      setHasFinishedInitialLoad(true);
    }
  }, [loading]);

  const { providers } = useProviders(sessionUserId);
  const { resources } = useResources(sessionUserId);

  // Day view: single-day array for WeekView reuse
  const dayViewDays = useMemo(() => [state.currentDate], [state.currentDate]);
  const visibleDays = state.viewType === 'month' ? monthDays : state.viewType === 'day' ? dayViewDays : weekDays;
  const viewStart = visibleDays[0];
  const viewEnd = visibleDays[visibleDays.length - 1];
  const { blockedTimes } = useBlockedTimes(
    sessionUserId,
    state.selectedProvider?.id,
    state.selectedResource?.id,
    viewStart,
    viewEnd
  );

  const [selectedDay, setSelectedDay]               = useState<Date>(() => new Date());
  const [services, setServices]                     = useState<Service[]>(initialServices);
  const hasRequestedServicesRef = useRef(false);
  const [showCreateModal, setShowCreateModal]       = useState(false);
  const [showPreviewModal, setShowPreviewModal]     = useState(false);
  const [appointmentModalMode, setAppointmentModalMode] = useState<'create' | 'edit'>('create');
  const [editInitialData, setEditInitialData] = useState<{
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    serviceId: string;
    notes: string;
    category?: string;
    color?: string;
  } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm]   = useState(false);
  const [showConflictModal, setShowConflictModal]   = useState(false);
  const [conflictData, setConflictData] = useState<{ conflicts: any[]; suggestions: any[] }>({
    conflicts: [],
    suggestions: [],
  });

  // Drag-and-drop
  const { draggedAppointment, handleDragStart, handleDragEnd, handleDrop } = useDragAndDrop(
    async (appointmentId, newStartTime, newEndTime) => {
      const ok = await updateAppointment(appointmentId, {
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      });
      ok
        ? toast.success('Programarea a fost mutata.')
        : toast.error('Nu s-a putut muta programarea. Verifica conflictele.');
      return ok;
    }
  );

  // Search filtering happens inside DayPanel — calendar views always show all appointments

  // Lazy-load services if not provided server-side
  useEffect(() => {
    if (initialServices.length > 0 || hasRequestedServicesRef.current) return;
    hasRequestedServicesRef.current = true;
    fetch('/api/services')
      .then((r) => r.json())
      .then((d) => setServices(d.services || []))
      .catch(() => toast.error('Eroare la incarcarea serviciilor.'));
  }, [initialServices.length, toast]);

  // ESC to close all modals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setShowCreateModal(false);
      setShowPreviewModal(false);
      setShowDeleteConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Select a day in the panel without opening the create modal */
  const handleDayHeaderClick = (day: Date) => {
    setSelectedDay(day);
    actions.navigateToDate(day);
  };

  /** Click on an empty slot — selects day AND opens create modal */
  const handleSlotClick = (day: Date, hour?: number) => {
    setSelectedDay(day);
    const start = new Date(day);
    start.setHours(hour ?? 9, 0, 0, 0);
    const duration = (services[0]?.duration_minutes ?? 60);
    const end = new Date(start.getTime() + duration * 60_000);
    actions.selectDate(day);
    actions.selectSlot({ start, end });
    setAppointmentModalMode('create');
    setEditInitialData(null);
    setShowCreateModal(true);
  };

  const handleAppointmentClick = (appointment: any) => {
    actions.selectAppointment(appointment);
    setShowPreviewModal(true);
  };

  /** Jump to date from header range label click or mini calendar nav */
  const handleJumpToDate = (date: Date) => {
    setSelectedDay(date);
    actions.navigateToDate(date);
  };

  const handlePanelStatusChange = async (appointmentId: number, status: string) => {
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await res.json();
      if (res.ok) {
        refetch();
        const label =
          status === 'completed' ? 'completata' : status === 'cancelled' ? 'anulata' : 'absenta';
        toast.success(`Programarea a fost marcata ca ${label}.`);
      } else {
        toast.error(result.error || 'Nu s-a putut actualiza statusul.');
      }
    } catch {
      toast.error('Eroare la actualizarea statusului.');
    }
  };

  const handleCreateAppointment = async (formData: {
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    serviceId: string;
    notes: string;
    category?: string;
    color?: string;
    isRecurring?: boolean;
    recurrence?: {
      frequency: 'daily' | 'weekly' | 'monthly';
      interval: number;
      endType: 'date' | 'count';
      endDate?: string;
      count?: number;
    };
  }) => {
    if (!state.selectedSlot || !formData.clientName.trim() || !formData.serviceId) {
      toast.warning('Completeaza toate campurile obligatorii (nume client si serviciu).');
      return;
    }

    const service = services.find((s) => s.id.toString() === formData.serviceId);
    const duration = service?.duration_minutes ?? 60;
    const endTime = new Date(state.selectedSlot.start.getTime() + duration * 60_000);

    if (formData.isRecurring && formData.recurrence) {
      try {
        const res = await fetch('/api/appointments/recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceId: parseInt(formData.serviceId),
            clientName: formData.clientName.trim(),
            clientEmail: formData.clientEmail || undefined,
            clientPhone: formData.clientPhone || undefined,
            startTime: state.selectedSlot.start.toISOString(),
            endTime: endTime.toISOString(),
            providerId: state.selectedProvider?.id,
            resourceId: state.selectedResource?.id,
            notes: formData.notes,
            category: formData.category,
            color: formData.color,
            recurrence: {
              frequency: formData.recurrence.frequency,
              interval: formData.recurrence.interval,
              ...(formData.recurrence.endType === 'count'
                ? { count: formData.recurrence.count }
                : { end_date: formData.recurrence.endDate }),
            },
          }),
        });
        const result = await res.json();
        if (res.ok) {
          setShowCreateModal(false);
          actions.clearSelection();
          refetch();
          toast.success(
            `${result.created} programari recurente create${result.skipped > 0 ? `, ${result.skipped} omise` : ''}.`
          );
        } else {
          toast.error(result.error || 'Nu s-au putut crea programarile recurente.');
        }
      } catch {
        toast.error('Eroare la crearea programarilor recurente.');
      }
    } else {
      const ok = await createAppointment({
        serviceId: parseInt(formData.serviceId),
        clientName: formData.clientName.trim(),
        clientEmail: formData.clientEmail || undefined,
        clientPhone: formData.clientPhone || undefined,
        startTime: state.selectedSlot.start.toISOString(),
        endTime: endTime.toISOString(),
        notes: formData.notes,
        category: formData.category,
        color: formData.color,
      });
      if (ok.ok) {
        setShowCreateModal(false);
        actions.clearSelection();
        toast.success('Programarea a fost creata.');
      } else {
        toast.error(ok.error || 'Nu s-a putut crea programarea.');
      }
    }
  };

  const handleEditClick = async () => {
    if (!state.selectedAppointment) return;
    let appointment = state.selectedAppointment;
    try {
      const res = await fetch(`/api/appointments/${state.selectedAppointment.id}`);
      const result = await res.json();
      if (res.ok && result?.appointment) {
        appointment = result.appointment;
        actions.selectAppointment(result.appointment);
      }
    } catch {
      // proceed with existing data
    }
    const start = new Date(appointment.start_time);
    const end = new Date(appointment.end_time);
    actions.selectSlot({ start, end });
    setAppointmentModalMode('edit');
    setEditInitialData({
      clientName: appointment.client_name || '',
      clientEmail: appointment.client_email || '',
      clientPhone: appointment.client_phone || '',
      serviceId: appointment.service_id ? String(appointment.service_id) : '',
      notes: appointment.notes || '',
      category: appointment.category || undefined,
      color: appointment.color || undefined,
    });
    setShowPreviewModal(false);
    setShowCreateModal(true);
  };

  const handleEditAppointment = async (formData: {
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    serviceId: string;
    notes: string;
    category?: string;
    color?: string;
  }) => {
    if (!state.selectedAppointment || !state.selectedSlot) return;

    const service = services.find((s) => s.id.toString() === formData.serviceId);
    const duration = service?.duration_minutes ?? 60;
    const newStart = state.selectedSlot.start;
    const newEnd = new Date(newStart.getTime() + duration * 60_000);

    try {
      const res = await fetch(`/api/appointments/${state.selectedAppointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
          serviceId: parseInt(formData.serviceId, 10),
          clientName: formData.clientName.trim(),
          clientEmail: formData.clientEmail || undefined,
          clientPhone: formData.clientPhone || undefined,
          notes: formData.notes,
          category: formData.category,
          color: formData.color,
          providerId: state.selectedProvider?.id,
          resourceId: state.selectedResource?.id,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setShowCreateModal(false);
        actions.clearSelection();
        refetch();
        toast.success('Programarea a fost actualizata.');
      } else if (res.status === 409) {
        let conflicts = result.conflicts || [];
        let suggestions = result.suggestions || [];
        if ((!conflicts.length && !suggestions.length) && typeof result.details === 'string') {
          try {
            const parsed = JSON.parse(result.details);
            conflicts = parsed.conflicts || conflicts;
            suggestions = parsed.suggestions || suggestions;
          } catch {
            // Ignore invalid details format
          }
        }
        setConflictData({ conflicts, suggestions });
        setShowConflictModal(true);
      } else {
        toast.error(result.error || 'Nu s-a putut actualiza programarea.');
      }
    } catch {
      toast.error('Eroare la actualizarea programarii.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!state.selectedAppointment) return;
    const ok = await deleteAppointment(state.selectedAppointment.id);
    if (ok) {
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
    const ok = await updateAppointment(state.selectedAppointment.id, { status });
    if (ok) {
      refetch();
      toast.success('Statusul a fost actualizat.');
    } else {
      toast.error('Nu s-a putut actualiza statusul.');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const showInitialSkeleton = !hasFinishedInitialLoad && loading;

  if (showInitialSkeleton) {
    return (
      <div className={styles.container}>
        <main className={styles.main}>
          <div className="skeleton skeleton-line" style={{ width: '220px', height: '18px', marginBottom: '0.9rem' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '1rem' }}>
            <div className="skeleton skeleton-card" style={{ height: '560px' }} />
            <div className="skeleton-stack">
              <div className="skeleton skeleton-card" style={{ height: '120px' }} />
              <div className="skeleton skeleton-card" style={{ height: '430px' }} />
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <main className={styles.main}>

        {/* Calendar grid + day panel — always side-by-side for all views */}
        <div className={styles.calendarWithPanel}>
          {state.viewType === 'month' ? (
            <MonthView
              monthDays={monthDays}
              currentDate={state.currentDate}
              appointments={appointments}
              selectedDay={selectedDay}
              onDayClick={handleDayHeaderClick}
              onAppointmentClick={handleAppointmentClick}
            />
          ) : (
            /* Day view reuses WeekView with a single-day array */
            <WeekView
              weekDays={state.viewType === 'day' ? dayViewDays : weekDays}
              hours={hours}
              appointments={appointments}
              blockedTimes={blockedTimes}
              selectedDay={selectedDay}
              onSlotClick={handleSlotClick}
              onDayHeaderClick={handleDayHeaderClick}
              onAppointmentClick={handleAppointmentClick}
              enableDragDrop={state.viewType === 'week' || state.viewType === 'workweek'}
              draggedAppointment={draggedAppointment}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDrop={async (day, hour) => { await handleDrop(day, hour); }}
              providers={providers}
            />
          )}

          <DayPanel
            selectedDay={selectedDay}
            appointments={appointments}
            currentDate={state.currentDate}
            onAppointmentClick={(apt) => {
              actions.selectAppointment(apt);
              setShowPreviewModal(true);
            }}
            onQuickStatusChange={handlePanelStatusChange}
            onCreateClick={() => handleSlotClick(selectedDay, 9)}
            onNavigate={(date) => {
              setSelectedDay(date);
              actions.navigateToDate(date);
            }}
            rangeLabel={rangeLabel}
            viewType={state.viewType}
            providers={providers}
            resources={resources}
            selectedProviderId={state.selectedProvider?.id || null}
            selectedResourceId={state.selectedResource?.id || null}
            searchQuery={searchQuery}
            onPrevPeriod={actions.prevPeriod}
            onNextPeriod={actions.nextPeriod}
            onTodayClick={actions.goToToday}
            onViewTypeChange={actions.setViewType}
            onProviderChange={(id) => actions.selectProvider(providers.find((p) => p.id === id) || null)}
            onResourceChange={(id) => actions.selectResource(resources.find((r) => r.id === id) || null)}
            onSearchChange={setSearchQuery}
            onJumpToDate={handleJumpToDate}
          />
        </div>
      </main>

      <CreateAppointmentModal
        isOpen={showCreateModal}
        selectedSlot={state.selectedSlot}
        services={services}
        mode={appointmentModalMode}
        title={appointmentModalMode === 'edit' ? 'Editeaza programare' : 'Creeaza programare'}
        submitLabel={appointmentModalMode === 'edit' ? 'Salveaza modificarile' : 'Salveaza'}
        allowRecurring={appointmentModalMode === 'create'}
        initialData={appointmentModalMode === 'edit' ? editInitialData : null}
        onClose={() => {
          setShowCreateModal(false);
          setAppointmentModalMode('create');
          setEditInitialData(null);
          actions.clearSelection();
        }}
        onSubmit={appointmentModalMode === 'edit' ? handleEditAppointment : handleCreateAppointment}
      />

      <AppointmentPreviewModal
        isOpen={showPreviewModal}
        appointment={state.selectedAppointment}
        onClose={() => { setShowPreviewModal(false); actions.clearSelection(); }}
        onEdit={handleEditClick}
        onDelete={() => setShowDeleteConfirm(true)}
        onQuickStatusChange={handleQuickStatusChange}
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
          actions.selectSlot({ start: new Date(startTime), end: new Date(endTime) });
          setAppointmentModalMode('edit');
          setShowCreateModal(true);
        }}
      />

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
