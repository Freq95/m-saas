'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getISOWeek,
  getMonth,
  getYear,
  isSameDay,
  isSameMonth,
  isToday,
  setMonth,
  setYear,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { ro } from 'date-fns/locale';
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
  parseSessionUserId,
  type Appointment,
} from './hooks';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import {
  WeekView,
  DayPanel,
  CreateAppointmentModal,
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
  initialAppointments: Appointment[];
  initialServices: Service[];
  initialDate: string;
  initialViewType?: 'week';
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

type AppointmentModalMode = 'create' | 'edit' | 'view';

export default function CalendarPageClient({
  initialAppointments,
  initialServices,
  initialDate,
  initialViewType = 'week',
}: CalendarPageClientProps) {
  const toast = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [hasFinishedInitialLoad, setHasFinishedInitialLoad] = useState(initialAppointments.length > 0);
  const { data: session } = useSession();
  const sessionUserId = parseSessionUserId(session) ?? undefined;
  const { state, actions } = useCalendar(initialDate, initialViewType);
  const { weekDays, hours } = useCalendarNavigation({
    currentDate: state.currentDate,
    viewType: 'week',
  });

  useLayoutEffect(() => {
    const updateHeight = () => {
      const el = containerRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setAvailableHeight(Math.max(320, Math.floor(window.innerHeight - top)));
    };

    updateHeight();
    const raf = requestAnimationFrame(updateHeight);
    window.addEventListener('resize', updateHeight);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const { appointments, loading, refetch, createAppointment, updateAppointment, deleteAppointment } =
    useAppointments({
      currentDate: state.currentDate,
      viewType: 'week',
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

  const visibleDays = weekDays;
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
  const [seedingDemoServices, setSeedingDemoServices] = useState(false);
  const hasRequestedServicesRef = useRef(false);
  const [showCreateModal, setShowCreateModal]       = useState(false);
  const [appointmentModalMode, setAppointmentModalMode] = useState<AppointmentModalMode>('create');
  const [editInitialData, setEditInitialData] = useState<{
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    serviceId: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    notes: string;
    category?: string;
    color?: string;
    status?: string;
  } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm]   = useState(false);
  const [showConflictModal, setShowConflictModal]   = useState(false);
  const [conflictData, setConflictData] = useState<{ conflicts: ConflictItem[]; suggestions: ConflictSuggestion[] }>({
    conflicts: [],
    suggestions: [],
  });
  const [showDateDropdown, setShowDateDropdown] = useState(false);
  const [pickerDate, setPickerDate] = useState<Date>(state.currentDate);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const justDroppedRef = useRef(false);
  const justDroppedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const weekStart = useMemo(() => startOfWeek(state.currentDate, { weekStartsOn: 1 }), [state.currentDate]);
  const weekEnd = useMemo(() => endOfWeek(state.currentDate, { weekStartsOn: 1 }), [state.currentDate]);
  const weekRangeLabel = useMemo(() => {
    const monthLabel = (date: Date) => format(date, 'MMM', { locale: ro }).replace('.', '');
    const sameMonth = getMonth(weekStart) === getMonth(weekEnd);
    if (sameMonth) {
      return `${format(weekStart, 'd', { locale: ro })}-${format(weekEnd, 'd', { locale: ro })} ${monthLabel(weekEnd)} ${format(weekEnd, 'yyyy', { locale: ro })}`;
    }
    return `${format(weekStart, 'd', { locale: ro })} ${monthLabel(weekStart)}-${format(weekEnd, 'd', { locale: ro })} ${monthLabel(weekEnd)} ${format(weekEnd, 'yyyy', { locale: ro })}`;
  }, [weekStart, weekEnd]);
  const pickerMonthStart = useMemo(() => startOfMonth(pickerDate), [pickerDate]);
  const pickerDays = useMemo(() => {
    const monthStartWeek = startOfWeek(pickerMonthStart, { weekStartsOn: 1 });
    const monthEndWeek = endOfWeek(endOfMonth(pickerMonthStart), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: monthStartWeek, end: monthEndWeek });
  }, [pickerMonthStart]);
  const pickerWeeks = useMemo(() => {
    const weeks: Date[][] = [];
    for (let i = 0; i < pickerDays.length; i += 7) {
      weeks.push(pickerDays.slice(i, i + 7));
    }
    return weeks;
  }, [pickerDays]);
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, idx) => format(new Date(2000, idx, 1), 'MMM', { locale: ro }).replace('.', '')),
    []
  );
  const years = useMemo(() => {
    const base = getYear(pickerDate);
    return [base - 1, base, base + 1, base + 2];
  }, [pickerDate]);

  useEffect(() => {
    if (state.viewType !== 'week') {
      actions.setViewType('week');
    }
  }, [state.viewType, actions.setViewType]);

  useEffect(() => {
    if (!showDateDropdown) return;
    setPickerDate(state.currentDate);
  }, [showDateDropdown, state.currentDate]);

  // Drag-and-drop
  const { draggedAppointment, handleDragStart, handleDragEnd, handleDrop } = useDragAndDrop(
    async (appointmentId, newStartTime, newEndTime) => {
      const result = await updateAppointment(appointmentId, {
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString(),
      });
      if (result.ok) {
        justDroppedRef.current = true;
        if (justDroppedTimeoutRef.current) {
          clearTimeout(justDroppedTimeoutRef.current);
        }
        justDroppedTimeoutRef.current = setTimeout(() => {
          justDroppedRef.current = false;
          justDroppedTimeoutRef.current = null;
        }, 100);
        toast.success('Programarea a fost mutata.');
        return true;
      }
      if (result.status === 409) {
        setConflictData({
          conflicts: result.conflicts || [],
          suggestions: result.suggestions || [],
        });
        setShowConflictModal(true);
        toast.warning(result.error || 'Intervalul ales intra in conflict.');
        return false;
      }
      toast.error(result.error || 'Nu s-a putut muta programarea. Verifica conflictele.');
      return false;
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

  const seedDemoDentalServices = async () => {
    if (seedingDemoServices) return;
    setSeedingDemoServices(true);
    const demoServices = [
      { name: 'Consultatie initiala', durationMinutes: 30, price: 150, description: 'Evaluare clinica initiala' },
      { name: 'Detartraj + periaj profesional', durationMinutes: 60, price: 320, description: 'Igienizare profesionala completa' },
      { name: 'Tratament carie simpla', durationMinutes: 45, price: 280, description: 'Tratament restaurativ carie simpla' },
      { name: 'Obturatie compozit', durationMinutes: 45, price: 350, description: 'Plomba compozit fotopolimerizabil' },
      { name: 'Extractie dentara', durationMinutes: 45, price: 420, description: 'Extractie simpla, fara complicatii' },
      { name: 'Control periodic', durationMinutes: 15, price: 90, description: 'Control de rutina' },
    ];

    try {
      const results = await Promise.all(
        demoServices.map((service) =>
          fetch('/api/services', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(service),
          })
        )
      );
      const created = results.filter((res) => res.ok).length;
      const refreshed = await fetch('/api/services', { cache: 'no-store' });
      if (refreshed.ok) {
        const payload = await refreshed.json();
        setServices(payload.services || []);
      }
      if (created > 0) {
        toast.success(`Servicii demo adaugate: ${created}`);
      } else {
        toast.warning('Nu am adaugat servicii noi (posibil sa existe deja).');
      }
    } catch {
      toast.error('Nu am putut adauga serviciile demo.');
    } finally {
      setSeedingDemoServices(false);
    }
  };

  // ESC to close all modals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showDateDropdown) {
        setShowDateDropdown(false);
        return;
      }
      if (showDeleteConfirm) {
        setShowDeleteConfirm(false);
        return;
      }
      if (showConflictModal) {
        setShowConflictModal(false);
        return;
      }
      // Let CreateAppointmentModal handle its own ESC (isDirty guard lives there)
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showConflictModal, showCreateModal, showDateDropdown, showDeleteConfirm]);

  useEffect(() => {
    return () => {
      if (justDroppedTimeoutRef.current) {
        clearTimeout(justDroppedTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showDateDropdown) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!dateDropdownRef.current) return;
      if (!dateDropdownRef.current.contains(event.target as Node)) {
        setShowDateDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDateDropdown]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Select a day in the panel without opening the create modal */
  const handleDayHeaderClick = (day: Date) => {
    navigateToDate(day);
  };

  /** Click on an empty slot — selects day AND opens create modal */
  const handleSlotClick = (day: Date, hour?: number, minute: 0 | 30 = 0) => {
    if (justDroppedRef.current) {
      return;
    }
    setSelectedDay(day);
    const start = new Date(day);
    start.setHours(hour ?? 9, minute, 0, 0);
    const duration = 30;
    const end = new Date(start.getTime() + duration * 60_000);
    actions.selectSlot({ start, end });
    setAppointmentModalMode('create');
    setEditInitialData(null);
    setShowCreateModal(true);
  };

  const buildAppointmentInitialData = (appointment: Appointment) => {
    const start = new Date(appointment.start_time);
    const end = new Date(appointment.end_time);

    return {
      clientName: appointment.client_name || '',
      clientEmail: appointment.client_email || '',
      clientPhone: appointment.client_phone || '',
      serviceId: appointment.service_id ? String(appointment.service_id) : '',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationMinutes: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000)),
      notes: appointment.notes || '',
      category: appointment.category || undefined,
      color: appointment.color || undefined,
      status: appointment.status,
    };
  };

  const openAppointmentDetails = async (appointment: Appointment) => {
    let nextAppointment = appointment;
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`);
      const result = await res.json();
      if (res.ok && result?.appointment) {
        nextAppointment = result.appointment;
      }
    } catch {
      // Keep current appointment snapshot if details fetch fails.
    }

    actions.selectAppointment(nextAppointment);
    actions.selectSlot({
      start: new Date(nextAppointment.start_time),
      end: new Date(nextAppointment.end_time),
    });
    setEditInitialData(buildAppointmentInitialData(nextAppointment));
    setAppointmentModalMode('view');
    setShowCreateModal(true);
  };

  const handleAppointmentClick = (appointment: Appointment) => {
    if (justDroppedRef.current) return;
    void openAppointmentDetails(appointment);
  };

  const updateStatusWithUndo = async (appointment: Appointment, nextStatus: string) => {
    const previousStatus = appointment.status;
    if (previousStatus === nextStatus) {
      return;
    }

    const result = await updateAppointment(appointment.id, { status: nextStatus });
    if (!result.ok) {
      toast.error(result.error || 'Nu s-a putut actualiza statusul.');
      return;
    }

    actions.selectAppointment({ ...appointment, status: nextStatus });
    setEditInitialData((prev) => (prev ? { ...prev, status: nextStatus } : prev));
    refetch();
    if (result.warning) {
      toast.warning(result.warning);
    }
    toast.success('Status schimbat.', {
      duration: 5000,
      actionLabel: 'Anuleaza',
      onAction: async () => {
        const undoResult = await updateAppointment(appointment.id, { status: previousStatus });
        if (!undoResult.ok) {
          toast.error(undoResult.error || 'Nu s-a putut reveni la statusul anterior.');
          return;
        }
        actions.selectAppointment({ ...appointment, status: previousStatus });
        setEditInitialData((prev) => (prev ? { ...prev, status: previousStatus } : prev));
        refetch();
        toast.info('Status restaurat.');
      },
    });
  };

  const handlePanelStatusChange = async (appointmentId: number, status: string) => {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) {
      toast.error('Programarea nu a fost gasita.');
      return;
    }

    try {
      await updateStatusWithUndo(appointment, status);
    } catch {
      toast.error('Eroare la actualizarea statusului.');
    }
  };

  const handleCreateAppointment = async (formData: {
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    forceNewClient?: boolean;
    serviceId: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
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
    if (!formData.clientName.trim() || !formData.serviceId || !formData.startTime || !formData.endTime) {
      toast.warning('Completeaza toate campurile obligatorii (nume client si serviciu).');
      return;
    }

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
            startTime: formData.startTime,
            endTime: formData.endTime,
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
        forceNewClient: formData.forceNewClient,
        startTime: formData.startTime,
        endTime: formData.endTime,
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
    setEditInitialData(buildAppointmentInitialData(appointment));
    setShowCreateModal(true);
  };

  const handleEditAppointment = async (formData: {
    clientName: string;
    clientEmail: string;
    clientPhone: string;
    serviceId: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
    notes: string;
    category?: string;
    color?: string;
    status?: string;
  }) => {
    if (!state.selectedAppointment || !formData.startTime || !formData.endTime) return;

    const newStart = new Date(formData.startTime);
    const newEnd = new Date(formData.endTime);

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
          status: formData.status,
          providerId: state.selectedProvider?.id,
          resourceId: state.selectedResource?.id,
        }),
      });
      const result = await res.json();
      if (res.ok) {
        setShowCreateModal(false);
        actions.clearSelection();
        refetch();
        if (result.warning) {
          toast.warning(result.warning);
        }
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
        setShowCreateModal(false);
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
      setShowCreateModal(false);
      setShowDeleteConfirm(false);
      actions.clearSelection();
      toast.success('Programarea a fost stearsa.');
    } else {
      toast.error('Nu s-a putut sterge programarea.');
    }
  };

  const handleQuickStatusChange = async (status: string) => {
    if (!state.selectedAppointment) return;
    await updateStatusWithUndo(state.selectedAppointment, status);
  };

  const navigateToDate = (date: Date) => {
    setSelectedDay(date);
    actions.navigateToDate(date);
  };

  const handleTodayClick = () => {
    const today = new Date();
    navigateToDate(today);
    setShowDateDropdown(false);
  };

  const handlePrevWeek = () => {
    const prevWeek = subWeeks(state.currentDate, 1);
    navigateToDate(prevWeek);
  };

  const handleNextWeek = () => {
    const nextWeek = addWeeks(state.currentDate, 1);
    navigateToDate(nextWeek);
  };

  const handlePickerDaySelect = (date: Date) => {
    navigateToDate(date);
    setShowDateDropdown(false);
  };

  const weekToolbarControls = (
    <div className={styles.weekToolbar} ref={dateDropdownRef}>
      <button type="button" className={styles.todayButton} onClick={handleTodayClick}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>Astazi</span>
      </button>

      <div className={styles.weekArrows}>
        <button type="button" className={styles.navArrowButton} onClick={handlePrevWeek} aria-label="Saptamana anterioara">
          {'<'}
        </button>
        <button type="button" className={styles.navArrowButton} onClick={handleNextWeek} aria-label="Saptamana urmatoare">
          {'>'}
        </button>
      </div>

      <button
        type="button"
        className={styles.rangeButton}
        aria-expanded={showDateDropdown}
        onClick={() => setShowDateDropdown((prev) => !prev)}
      >
        <span>{weekRangeLabel}</span>
        <span className={styles.rangeChevron}>{showDateDropdown ? '\u25b2' : '\u25bc'}</span>
      </button>

      {showDateDropdown && (
        <div className={styles.dateDropdown} role="dialog" aria-label="Selecteaza data">
          <div className={styles.dateDropdownCalendar}>
            <div className={styles.dropdownMonthHeader}>
              <button type="button" className={styles.dropdownArrow} onClick={() => setPickerDate(subMonths(pickerDate, 1))} aria-label="Luna anterioara">
                {'<'}
              </button>
              <span>{format(pickerDate, 'MMMM yyyy', { locale: ro })}</span>
              <button type="button" className={styles.dropdownArrow} onClick={() => setPickerDate(addMonths(pickerDate, 1))} aria-label="Luna urmatoare">
                {'>'}
              </button>
            </div>

            <div className={styles.dropdownWeekLabels}>
              <span>S</span>
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => (
                <span key={`${label}-${index}`}>{label}</span>
              ))}
            </div>

            <div className={styles.dropdownWeeks}>
              {pickerWeeks.map((week) => (
                <div key={week[0].toISOString()} className={styles.dropdownWeekRow}>
                  <span className={styles.dropdownWeekNumber}>{getISOWeek(week[0])}</span>
                  {week.map((day) => {
                    const outsideMonth = !isSameMonth(day, pickerMonthStart);
                    const selected = isSameDay(day, state.currentDate);
                    const todayFlag = isToday(day);
                    return (
                      <button
                        key={day.toISOString()}
                        type="button"
                        className={[
                          styles.dropdownDay,
                          outsideMonth ? styles.dropdownDayMuted : '',
                          selected ? styles.dropdownDaySelected : '',
                          todayFlag ? styles.dropdownDayToday : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => handlePickerDaySelect(day)}
                      >
                        {format(day, 'd')}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className={styles.dateDropdownSide}>
            <div className={styles.yearSelector}>
              <button type="button" className={styles.dropdownArrow} onClick={() => setPickerDate(setYear(pickerDate, getYear(pickerDate) - 1))} aria-label="An precedent">
                {'<'}
              </button>
              <span>{getYear(pickerDate)}</span>
              <button type="button" className={styles.dropdownArrow} onClick={() => setPickerDate(setYear(pickerDate, getYear(pickerDate) + 1))} aria-label="An urmator">
                {'>'}
              </button>
            </div>

            <div className={styles.monthSelectorGrid}>
              {months.map((monthLabel, index) => (
                <button
                  key={`${monthLabel}-${index}`}
                  type="button"
                  className={`${styles.monthSelectorButton}${getMonth(pickerDate) === index ? ` ${styles.monthSelectorButtonActive}` : ''}`}
                  onClick={() => setPickerDate(setMonth(pickerDate, index))}
                >
                  {monthLabel}
                </button>
              ))}
            </div>

            <div className={styles.yearList}>
              {years.map((year) => (
                <button
                  key={year}
                  type="button"
                  className={`${styles.yearListButton}${getYear(pickerDate) === year ? ` ${styles.yearListButtonActive}` : ''}`}
                  onClick={() => setPickerDate(setYear(pickerDate, year))}
                >
                  {year}
                </button>
              ))}
            </div>

            <button type="button" className={styles.dropdownTodayLink} onClick={handleTodayClick}>
              Astazi
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  const showInitialSkeleton = !hasFinishedInitialLoad && loading;

  if (showInitialSkeleton) {
    return (
      <div
        ref={containerRef}
        className={styles.container}
        style={availableHeight ? { height: `${availableHeight}px` } : undefined}
      >
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
    <div
      ref={containerRef}
      className={styles.container}
      style={availableHeight ? { height: `${availableHeight}px` } : undefined}
    >
      <main className={styles.main}>
        <div className={styles.calendarWithPanel}>
          <WeekView
            weekDays={weekDays}
            hours={hours}
            appointments={appointments}
            blockedTimes={blockedTimes}
            selectedDay={selectedDay}
            onSlotClick={handleSlotClick}
            onDayHeaderClick={handleDayHeaderClick}
            onAppointmentClick={handleAppointmentClick}
            enableDragDrop
            draggedAppointment={draggedAppointment}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={async (day, hour, minute) => { await handleDrop(day, hour, minute); }}
            providers={providers}
          />

          <DayPanel
            topControls={weekToolbarControls}
            selectedDay={selectedDay}
            appointments={appointments}
            onAppointmentClick={handleAppointmentClick}
            onQuickStatusChange={handlePanelStatusChange}
            onCreateClick={() => handleSlotClick(selectedDay, 9)}
            onNavigate={(date) => {
              navigateToDate(date);
            }}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>
      </main>

      <CreateAppointmentModal
        isOpen={showCreateModal}
        selectedSlot={state.selectedSlot}
        services={services}
        onSeedDemoServices={seedDemoDentalServices}
        isSeedingDemoServices={seedingDemoServices}
        mode={appointmentModalMode}
        title={
          appointmentModalMode === 'view'
            ? 'Detalii programare'
            : appointmentModalMode === 'edit'
              ? 'Editeaza programare'
              : 'Creeaza programare'
        }
        submitLabel={appointmentModalMode === 'edit' ? 'Salveaza modificarile' : 'Salveaza'}
        allowRecurring={appointmentModalMode === 'create'}
        initialData={editInitialData}
        onModeChange={setAppointmentModalMode}
        appointmentStatus={editInitialData?.status || state.selectedAppointment?.status}
        onStatusChange={appointmentModalMode === 'create' ? undefined : handleQuickStatusChange}
        onDelete={appointmentModalMode === 'view' ? () => {
          setShowCreateModal(false);
          setShowDeleteConfirm(true);
        } : undefined}
        onClose={() => {
          setShowCreateModal(false);
          setAppointmentModalMode('create');
          setEditInitialData(null);
          actions.clearSelection();
        }}
        onSubmit={appointmentModalMode === 'edit' ? handleEditAppointment : handleCreateAppointment}
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
          setEditInitialData((prev) =>
            prev
              ? {
                  ...prev,
                  startTime,
                  endTime,
                  durationMinutes: Math.max(
                    15,
                    Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60_000)
                  ),
                }
              : prev
          );
          setAppointmentModalMode('edit');
          setShowCreateModal(true);
        }}
      />

      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
