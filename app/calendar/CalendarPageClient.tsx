'use client';

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getMonth,
  getYear,
  isSameDay,
  isToday,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import styles from './page.module.css';
import { useToast } from '@/lib/useToast';
import { useIsMobile } from '@/lib/useIsMobile';
import { ToastContainer } from '@/components/Toast';
import {
  useCalendar,
  useAppointmentsSWR as useAppointments,
  useCalendarList,
  useCalendarScopeSelection,
  parseSessionUserId,
  parseSessionDbUserId,
  type Appointment,
  type CalendarListItem,
} from './hooks';
import { useDragAndDrop } from './hooks/useDragAndDrop';
import {
  CalendarDatePickerDropdown,
  WeekView,
  DayPanel,
  CreateAppointmentModal,
  DeleteConfirmModal,
  ConflictWarningModal,
} from './components';
import { AppointmentCard, CalendarScopeDropdown } from './components/DayPanel/DayPanel';
import { useCalendarNavigation } from './hooks/useCalendarNavigation';
import { canCreateOnCalendar, decorateAppointmentWithCalendarAccess } from './lib/appointment-access';

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

type AppointmentModalData = {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  forceNewClient?: boolean;
  calendarId?: number;
  calendarName?: string;
  dentistUserId?: number;
  dentistDisplayName?: string;
  serviceName?: string;
  serviceId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  notes: string;
  category?: string;
  color?: string;
  status?: string;
  isRecurring?: boolean;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endType: 'date' | 'count';
    endDate?: string;
    count?: number;
  };
};

export default function CalendarPageClient({
  initialAppointments,
  initialServices,
  initialDate,
  initialViewType = 'week',
}: CalendarPageClientProps) {
  const toast = useToast();
  const showErrorToast = toast.error;
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [hasFinishedInitialLoad, setHasFinishedInitialLoad] = useState(initialAppointments.length > 0);
  const { data: session } = useSession();
  const sessionUserId = parseSessionUserId(session) ?? undefined;
  const sessionDbUserId = parseSessionDbUserId(session) ?? undefined;
  const { state, actions } = useCalendar(initialDate, initialViewType);
  const {
    ownCalendars,
    sharedCalendars,
    calendars,
    loading: calendarsLoading,
  } = useCalendarList();
  const calendarScopeStorageKey = useMemo(
    () => `calendar:selectedScope:${session?.user?.dbUserId || String(sessionUserId || 'anonymous')}`,
    [session?.user?.dbUserId, sessionUserId]
  );
  const calendarMap = useMemo(
    () => new Map<number, CalendarListItem>(calendars.map((calendar) => [calendar.id, calendar])),
    [calendars]
  );
  const allCalendarIds = useMemo(
    () => calendars.map((calendar) => calendar.id),
    [calendars]
  );
  const {
    selectedCalendarScope,
    setSelectedCalendarScope,
  } = useCalendarScopeSelection({
    storageKey: calendarScopeStorageKey,
    calendarsLoading,
    validCalendarIds: allCalendarIds,
  });
  const writableCalendars = useMemo(
    () => calendars.filter((calendar) => canCreateOnCalendar(calendar)),
    [calendars]
  );
  const selectedCalendar = useMemo(
    () => (
      selectedCalendarScope === 'all'
        ? null
        : calendarMap.get(selectedCalendarScope) || null
    ),
    [calendarMap, selectedCalendarScope]
  );
  const defaultCreateCalendar = useMemo(() => {
    if (selectedCalendar) {
      return canCreateOnCalendar(selectedCalendar) ? selectedCalendar : null;
    }
    return writableCalendars[0] || null;
  }, [selectedCalendar, writableCalendars]);
  const calendarOptions = useMemo(
    () => {
      if (selectedCalendar && canCreateOnCalendar(selectedCalendar)) {
      return [{
          id: selectedCalendar.id,
          name: selectedCalendar.name,
          color: selectedCalendar.color,
          description: selectedCalendar.isOwner
            ? 'Calendar propriu'
            : selectedCalendar.sharedByName
              ? `Partajat de ${selectedCalendar.sharedByName}`
              : 'Calendar partajat',
        }];
      }

      return writableCalendars.map((calendar) => ({
        id: calendar.id,
        name: calendar.name,
        color: calendar.color,
        description: calendar.isOwner
          ? 'Calendar propriu'
          : calendar.sharedByName
            ? `Partajat de ${calendar.sharedByName}`
            : 'Calendar partajat',
      }));
    },
    [selectedCalendar, writableCalendars]
  );
  const canCreateAppointments = selectedCalendar
    ? canCreateOnCalendar(selectedCalendar)
    : writableCalendars.length > 0;
  const appointmentsFetchCalendarIds = calendarsLoading
    ? undefined
    : selectedCalendar
      ? [selectedCalendar.id]
      : allCalendarIds;
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
      calendarIds: appointmentsFetchCalendarIds,
      search: debouncedSearchQuery,
      initialAppointments,
    });
  const decoratedAppointments = useMemo(
    () => appointments.map((appointment) => decorateAppointmentWithCalendarAccess(appointment, calendarMap, sessionDbUserId)),
    [appointments, calendarMap, sessionDbUserId]
  );

  useEffect(() => {
    if (!loading) {
      setHasFinishedInitialLoad(true);
    }
  }, [loading]);

  const visibleDays = weekDays;

  const [selectedDay, setSelectedDay]               = useState<Date>(() => new Date());
  const [pendingCancelAppointment, setPendingCancelAppointment] = useState<Appointment | null>(null);
  const [hoveredAppointmentId, setHoveredAppointmentId] = useState<number | null>(null);
  const [services, setServices]                     = useState<Service[]>(initialServices);
  const [seedingDemoServices, setSeedingDemoServices] = useState(false);
  const hasRequestedServicesRef = useRef(false);
  const [showCreateModal, setShowCreateModal]       = useState(false);
  const [appointmentModalMode, setAppointmentModalMode] = useState<AppointmentModalMode>('create');
  const [editInitialData, setEditInitialData] = useState<AppointmentModalData | null>(null);
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
  const handledContactPrefillRef = useRef<number | null>(null);
  const pendingRescheduleIdRef = useRef<number | null>(null);

  // Mobile-specific state
  const [mobileView, setMobileView] = useState<'day' | 'week'>('day');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState('');
  const mobileViewContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  // Mobile day appointments (filtered + sorted for the selected day)
  const mobileDayAppointments = useMemo(() => {
    if (!isMobile) return [];
    return [...decoratedAppointments]
      .filter((apt) => isSameDay(new Date(apt.start_time), selectedDay))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [isMobile, decoratedAppointments, selectedDay]);

  // Mobile search results
  const mobileSearchResults = useMemo(() => {
    if (!isMobile || !mobileSearchQuery.trim()) return [];
    const q = mobileSearchQuery.toLowerCase();
    return [...decoratedAppointments]
      .filter(
        (apt) =>
          apt.client_name.toLowerCase().includes(q) ||
          apt.service_name.toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
  }, [isMobile, mobileSearchQuery, decoratedAppointments]);

  // Sync scroll-snap position with mobileView state
  useEffect(() => {
    const el = mobileViewContainerRef.current;
    if (!el || !isMobile) return;

    let rafId: number;
    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const scrollLeft = el.scrollLeft;
        const width = el.clientWidth;
        const newView = scrollLeft > width * 0.5 ? 'week' : 'day';
        setMobileView((prev) => (prev !== newView ? newView : prev));
      });
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(rafId);
    };
  }, [isMobile]);

  // Focus search input when search overlay opens
  useEffect(() => {
    if (mobileSearchOpen && mobileSearchInputRef.current) {
      mobileSearchInputRef.current.focus();
    }
  }, [mobileSearchOpen]);

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

  useEffect(() => {
    const contactIdParam = searchParams.get('contactId');
    if (!contactIdParam) return;

    const contactId = Number(contactIdParam);
    if (!Number.isInteger(contactId) || contactId <= 0) return;
    if (handledContactPrefillRef.current === contactId) return;
    handledContactPrefillRef.current = contactId;

    const defaultStart = state.selectedSlot?.start
      ? new Date(state.selectedSlot.start)
      : (() => {
        const now = new Date();
        now.setHours(9, 0, 0, 0);
        return now;
      })();
    const defaultEnd = state.selectedSlot?.end
      ? new Date(state.selectedSlot.end)
      : new Date(defaultStart.getTime() + 30 * 60_000);

    if (!defaultCreateCalendar) {
      showErrorToast('Selecteaza un calendar pe care poti crea programari.');
      return;
    }

    void (async () => {
      try {
        const response = await fetch(`/api/clients/${contactId}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error('Failed to fetch client');
        }
        const result = await response.json();
        const client = result?.client;
        if (!client) {
          throw new Error('Client not found');
        }

        const slot = { start: defaultStart, end: defaultEnd };
        actions.selectSlot(slot);
        setSelectedDay(slot.start);
        setAppointmentModalMode('create');
        setEditInitialData({
          clientName: client.name || '',
          clientEmail: client.email || '',
      clientPhone: client.phone || '',
      calendarId: defaultCreateCalendar?.id,
      calendarName: defaultCreateCalendar?.name,
      dentistUserId: undefined,
      dentistDisplayName: undefined,
      serviceId: '',
      startTime: slot.start.toISOString(),
          endTime: slot.end.toISOString(),
          durationMinutes: Math.max(15, Math.round((slot.end.getTime() - slot.start.getTime()) / 60_000)),
          notes: '',
        });
        setShowCreateModal(true);
      } catch {
        showErrorToast('Nu am putut preincarca datele clientului pentru programare.');
      }
    })();
  }, [actions.selectSlot, defaultCreateCalendar?.id, defaultCreateCalendar?.name, searchParams, showErrorToast, state.selectedSlot]);

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
        pendingRescheduleIdRef.current = appointmentId;
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
      .catch(() => showErrorToast('Eroare la incarcarea serviciilor.'));
  }, [initialServices.length, showErrorToast]);

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
  const handleSlotClick = (day: Date, hour?: number, minute: 0 | 15 | 30 | 45 = 0) => {
    if (justDroppedRef.current) {
      return;
    }
    if (!defaultCreateCalendar) {
      toast.warning('Selecteaza un calendar pe care poti crea programari.');
      return;
    }
    setSelectedDay(day);
    const start = new Date(day);
    start.setHours(hour ?? 9, minute, 0, 0);
    const duration = 30;
    const end = new Date(start.getTime() + duration * 60_000);
    actions.selectSlot({ start, end });
    setAppointmentModalMode('create');
    setEditInitialData({
      clientName: '',
      clientEmail: '',
      clientPhone: '',
      calendarId: defaultCreateCalendar.id,
      calendarName: defaultCreateCalendar.name,
      dentistUserId: undefined,
      dentistDisplayName: undefined,
      serviceId: '',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationMinutes: duration,
      notes: '',
    });
    setShowCreateModal(true);
  };

  const buildAppointmentInitialData = (appointment: Appointment) => {
    const start = new Date(appointment.start_time);
    const end = new Date(appointment.end_time);
    const recurrence = appointment.recurrence;
    const recurrenceCount = recurrence?.count;
    const recurrenceEndType: 'date' | 'count' = recurrenceCount ? 'count' : 'date';

    return {
      clientName: appointment.client_name || '',
      clientEmail: appointment.client_email || '',
      clientPhone: appointment.client_phone || '',
      calendarId: appointment.calendar_id ?? undefined,
      calendarName: appointment.calendar_name || calendarMap.get(appointment.calendar_id || -1)?.name || undefined,
      dentistUserId: appointment.service_owner_user_id,
      dentistDisplayName: appointment.dentist_display_name || undefined,
      serviceName: appointment.service_name || '',
      serviceId: appointment.service_id ? String(appointment.service_id) : '',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationMinutes: Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000)),
      notes: appointment.notes || '',
      category: appointment.category || undefined,
      color: appointment.color || undefined,
      status: appointment.status,
      isRecurring: Boolean(recurrence),
      recurrence: recurrence
        ? {
          frequency: recurrence.frequency,
          interval: Math.max(1, Number(recurrence.interval) || 1),
          endType: recurrenceEndType,
          endDate: recurrence.end_date || recurrence.endDate || '',
          count: recurrenceCount || 4,
        }
        : undefined,
    };
  };

  const openAppointmentDetails = async (appointment: Appointment) => {
    let nextAppointment = appointment;
    try {
      const res = await fetch(`/api/appointments/${appointment.id}`);
      const result = await res.json();
      if (res.ok && result?.appointment) {
        nextAppointment = decorateAppointmentWithCalendarAccess(result.appointment, calendarMap, sessionDbUserId);
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
    const appointment = decoratedAppointments.find((item) => item.id === appointmentId);
    if (!appointment) {
      toast.error('Programarea nu a fost gasita.');
      return;
    }
    if (appointment.can_change_status === false) {
      toast.warning('Nu ai permisiunea sa modifici aceasta programare.');
      return;
    }

    try {
      if (status === 'cancelled') {
        setPendingCancelAppointment(appointment);
        return;
      }
      await updateStatusWithUndo(appointment, status);
    } catch {
      toast.error('Eroare la actualizarea statusului.');
    }
  };

  const handleCreateAppointment = async (formData: AppointmentModalData) => {
    if (!formData.clientName.trim() || !formData.serviceId || !formData.startTime || !formData.endTime) {
      toast.warning('Completeaza toate campurile obligatorii (nume client si serviciu).');
      return;
    }
    const targetCalendarId = formData.calendarId || defaultCreateCalendar?.id;
    if (!targetCalendarId) {
      toast.warning('Selecteaza un calendar pe care poti crea programari.');
      return;
    }
    void calendarMap.get(targetCalendarId);

    if (formData.isRecurring && formData.recurrence) {
      try {
        const res = await fetch('/api/appointments/recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            calendarId: targetCalendarId,
            dentistUserId: formData.dentistUserId,
            serviceId: parseInt(formData.serviceId),
            clientName: formData.clientName.trim(),
            clientEmail: formData.clientEmail || undefined,
            clientPhone: formData.clientPhone || undefined,
            startTime: formData.startTime,
            endTime: formData.endTime,
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
            forceNewClient: formData.forceNewClient,
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
        calendarId: targetCalendarId,
        dentistUserId: formData.dentistUserId,
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
    if (state.selectedAppointment.can_edit === false) {
      toast.warning('Nu ai permisiunea sa editezi aceasta programare.');
      return;
    }
    let appointment = state.selectedAppointment;
    try {
      const res = await fetch(`/api/appointments/${state.selectedAppointment.id}`);
      const result = await res.json();
      if (res.ok && result?.appointment) {
        appointment = decorateAppointmentWithCalendarAccess(result.appointment, calendarMap, sessionDbUserId);
        actions.selectAppointment(appointment);
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

  const handleEditAppointment = async (formData: AppointmentModalData) => {
    if (!state.selectedAppointment || !formData.startTime || !formData.endTime) return;
    if (state.selectedAppointment.can_edit === false) {
      toast.warning('Nu ai permisiunea sa editezi aceasta programare.');
      return;
    }

    const newStart = new Date(formData.startTime);
    const newEnd = new Date(formData.endTime);
    const selectedServiceId = state.selectedAppointment.service_id
      ? String(state.selectedAppointment.service_id)
      : '';
    const didChangeService = Boolean(formData.serviceId) && formData.serviceId !== selectedServiceId;

    try {
      const res = await fetch(`/api/appointments/${state.selectedAppointment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startTime: newStart.toISOString(),
          endTime: newEnd.toISOString(),
          ...(didChangeService ? { serviceId: parseInt(formData.serviceId, 10) } : {}),
          clientName: formData.clientName.trim(),
          clientEmail: formData.clientEmail || undefined,
          clientPhone: formData.clientPhone || undefined,
          notes: formData.notes,
          category: formData.category,
          color: formData.color,
          status: formData.status,
          isRecurring: formData.isRecurring,
          recurrence: formData.isRecurring && formData.recurrence
            ? {
              frequency: formData.recurrence.frequency,
              interval: formData.recurrence.interval,
              ...(formData.recurrence.endType === 'count'
                ? { count: formData.recurrence.count }
                : { end_date: formData.recurrence.endDate }),
            }
            : null,
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
    if (state.selectedAppointment.can_delete === false) {
      toast.warning('Nu ai permisiunea sa stergi aceasta programare.');
      return;
    }
    const result = await deleteAppointment(state.selectedAppointment.id);
    if (result.ok) {
      setShowCreateModal(false);
      setShowDeleteConfirm(false);
      actions.clearSelection();
      toast.success('Programarea a fost stearsa.');
    } else {
      toast.error(result.error || 'Nu s-a putut sterge programarea.');
    }
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

  const calendarScopeValue = selectedCalendarScope === 'all'
    ? 'all'
    : String(selectedCalendarScope);

  const handleCalendarScopeChange = (value: string) => {
    if (value === 'all') {
      setSelectedCalendarScope('all');
      return;
    }

    const nextCalendarId = Number.parseInt(value, 10);
    if (Number.isInteger(nextCalendarId) && nextCalendarId > 0 && calendarMap.has(nextCalendarId)) {
      setSelectedCalendarScope(nextCalendarId);
    }
  };

  const calendarScopeOptions = useMemo(
    () => [
      {
        value: 'all',
        label: 'Toate calendarele',
        color: 'var(--color-accent)',
        group: 'all' as const,
      },
      ...ownCalendars.map((calendar) => ({
        value: String(calendar.id),
        label: calendar.name,
        color: calendar.color,
        group: 'own' as const,
      })),
      ...sharedCalendars.map((calendar) => ({
        value: String(calendar.id),
        label: calendar.sharedByName
          ? `${calendar.name} - ${calendar.sharedByName}`
          : calendar.name,
        color: calendar.color,
        group: 'shared' as const,
      })),
    ],
    [ownCalendars, sharedCalendars]
  );

  const renderDateDropdown = ({
    className,
    hideSidePanel = false,
  }: {
    className?: string;
    hideSidePanel?: boolean;
  } = {}) => (
    <CalendarDatePickerDropdown
      className={className}
      hideSidePanel={hideSidePanel}
      pickerDate={pickerDate}
      currentDate={state.currentDate}
      pickerMonthStart={pickerMonthStart}
      pickerWeeks={pickerWeeks}
      months={months}
      years={years}
      onPickerDateChange={setPickerDate}
      onDaySelect={handlePickerDaySelect}
      onTodayClick={handleTodayClick}
    />
  );

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

      {showDateDropdown && renderDateDropdown()}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  const calendarWithPanel = (
    <div className={styles.calendarWithPanel}>
      <WeekView
        weekDays={weekDays}
        hours={hours}
        appointments={decoratedAppointments}
        selectedDay={selectedDay}
        onSlotClick={handleSlotClick}
        onDayHeaderClick={handleDayHeaderClick}
        onAppointmentClick={handleAppointmentClick}
        enableDragDrop
        hoveredAppointmentId={hoveredAppointmentId}
        draggedAppointment={draggedAppointment}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDrop={async (day, hour, minute) => { await handleDrop(day, hour, minute); }}
      />

      <DayPanel
        topControls={weekToolbarControls}
        selectedDay={selectedDay}
        appointments={decoratedAppointments}
        onAppointmentClick={handleAppointmentClick}
        onQuickStatusChange={handlePanelStatusChange}
        onCreateClick={() => handleSlotClick(selectedDay, 9)}
        canCreate={canCreateAppointments}
        onNavigate={(date) => {
          navigateToDate(date);
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onHoverAppointment={setHoveredAppointmentId}
        calendarScopeValue={calendarScopeValue}
        calendarScopeOptions={calendarScopeOptions}
        onCalendarScopeChange={handleCalendarScopeChange}
      />
    </div>
  );

  const desktopCalendarView = calendarWithPanel;

  const mobileCalendarView = (
    <div className={styles.mobileCalendar}>
      {/* Layer 1: Compact header — date nav + search icon + scope chip */}
      <div className={styles.mobileHeader} ref={dateDropdownRef}>
        <button
          type="button"
          className={styles.mobileNavArrow}
          onClick={handlePrevWeek}
          aria-label="Saptamana anterioara"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <button
          type="button"
          className={styles.mobileHeaderDateBtn}
          onClick={() => setShowDateDropdown((prev) => !prev)}
          aria-expanded={showDateDropdown}
        >
          {mobileView === 'week'
            ? weekRangeLabel.replace(/\s*\d{4}$/, '')
            : format(selectedDay, 'd MMMM', { locale: ro })}
        </button>

        <button
          type="button"
          className={styles.mobileNavArrow}
          onClick={handleNextWeek}
          aria-label="Saptamana urmatoare"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <button
          type="button"
          className={styles.mobileHeaderIcon}
          onClick={() => setMobileSearchOpen(true)}
          aria-label="Cauta programari"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>

        {calendarScopeOptions.length > 1 && (
          <CalendarScopeDropdown
            value={calendarScopeValue}
            options={calendarScopeOptions}
            onChange={handleCalendarScopeChange}
            className={styles.mobileScopePicker}
            triggerClassName={styles.mobileScopeTrigger}
            menuClassName={styles.mobileScopeMenu}
          />
        )}

        {showDateDropdown && renderDateDropdown({
          className: styles.mobileHeaderDateDropdown,
          hideSidePanel: true,
        })}
      </div>

      {/* Layer 2: Day strip */}
      <div className={styles.mobileDayStrip}>
        {weekDays.map((day) => {
          const isActive = isSameDay(day, selectedDay);
          const isTodayDay = isToday(day);
          const dayLabel = format(day, 'EEE', { locale: ro }).replace('.', '');
          const shortDayLabel = `${dayLabel.charAt(0).toUpperCase()}${dayLabel.slice(1, 3)}`;

          return (
            <button
              key={day.toISOString()}
              type="button"
              className={[
                styles.mobileDayBtn,
                isActive ? styles.mobileDayBtnActive : '',
                isTodayDay ? styles.mobileDayBtnToday : '',
              ].filter(Boolean).join(' ')}
              onClick={() => navigateToDate(day)}
            >
              <span className={styles.mobileDayBtnLabel}>{shortDayLabel}</span>
              <span className={styles.mobileDayBtnNumber}>{format(day, 'd')}</span>
            </button>
          );
        })}
      </div>

      {/* Layer 3: Swipeable content — day list (left) + week grid (right) */}
      <div className={styles.mobileViewContainer} ref={mobileViewContainerRef}>
        {/* Day view panel */}
        <div className={styles.mobileViewPanel}>
          {mobileDayAppointments.length === 0 ? (
            <div className={styles.mobileEmptyDay}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ opacity: 0.3, marginBottom: '0.75rem' }}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Nicio programare</span>
              <span className={styles.mobileEmptyDaySub}>
                {isToday(selectedDay) ? 'Astazi' : format(selectedDay, 'EEEE, d MMMM', { locale: ro })}
              </span>
            </div>
          ) : (
            <div className={styles.mobileAppointmentList}>
              {mobileDayAppointments.map((apt) => (
                <AppointmentCard
                  key={apt.id}
                  appointment={apt}
                  onClick={handleAppointmentClick}
                  onStatusChange={handlePanelStatusChange}
                  onHoverAppointment={setHoveredAppointmentId}
                />
              ))}
            </div>
          )}
        </div>

        {/* Week view panel */}
        <div className={styles.mobileViewPanel}>
          <WeekView
            weekDays={weekDays}
            hours={hours}
            appointments={decoratedAppointments}
                selectedDay={selectedDay}
            onSlotClick={handleSlotClick}
            onDayHeaderClick={(day) => {
              navigateToDate(day);
              // Scroll back to day view
              mobileViewContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
            }}
            onAppointmentClick={handleAppointmentClick}
            enableDragDrop={false}
            hoveredAppointmentId={null}
            compact
          />
        </div>
      </div>

      {/* Layer 4: FAB */}
      <button
        type="button"
        className={styles.mobileFab}
        aria-label="Adauga programare"
        onClick={() => handleSlotClick(selectedDay, 9, 0)}
        disabled={!canCreateAppointments}
      >
        <svg
          className={styles.mobileFabIcon}
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {/* Search overlay */}
      {mobileSearchOpen && (
        <div className={styles.mobileSearchOverlay}>
          <div className={styles.mobileSearchHeader}>
            <button
              type="button"
              className={styles.mobileHeaderIcon}
              onClick={() => {
                setMobileSearchOpen(false);
                setMobileSearchQuery('');
              }}
              aria-label="Inchide cautarea"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className={styles.mobileSearchInputWrapper}>
              <input
                ref={mobileSearchInputRef}
                type="text"
                className={styles.mobileSearchInput}
                placeholder="Cauta programari..."
                value={mobileSearchQuery}
                onChange={(e) => setMobileSearchQuery(e.target.value)}
                autoComplete="off"
              />
              {mobileSearchQuery && (
                <button
                  type="button"
                  className={styles.mobileSearchClear}
                  onClick={() => setMobileSearchQuery('')}
                  aria-label="Sterge cautarea"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <div className={styles.mobileSearchResults}>
            {mobileSearchQuery.trim() === '' ? (
              <div className={styles.mobileEmptyDay}>
                <span style={{ opacity: 0.5 }}>Scrie pentru a cauta...</span>
              </div>
            ) : mobileSearchResults.length === 0 ? (
              <div className={styles.mobileEmptyDay}>
                <span>Niciun rezultat pentru &ldquo;{mobileSearchQuery}&rdquo;</span>
              </div>
            ) : (
              <div className={styles.mobileAppointmentList}>
                {mobileSearchResults.map((apt) => {
                  const aptDate = new Date(apt.start_time);
                  const dateLabel = isToday(aptDate)
                    ? 'Astazi'
                    : format(aptDate, 'EEEE, d MMM', { locale: ro });
                  return (
                    <AppointmentCard
                      key={apt.id}
                      appointment={apt}
                      onClick={(a) => {
                        handleAppointmentClick(a);
                        setMobileSearchOpen(false);
                        setMobileSearchQuery('');
                      }}
                      onStatusChange={handlePanelStatusChange}
                      dateLabel={dateLabel}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

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
        {isMobile ? mobileCalendarView : desktopCalendarView}
      </main>

      <CreateAppointmentModal
        isOpen={showCreateModal}
        selectedSlot={state.selectedSlot}
        services={services}
        calendarOptions={calendarOptions}
        activeCalendarId={editInitialData?.calendarId || selectedCalendar?.id || defaultCreateCalendar?.id || null}
        lockCalendarSelection={selectedCalendarScope !== 'all'}
        currentUserId={sessionUserId}
        currentUserDbUserId={sessionDbUserId || null}
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
        allowRecurring={appointmentModalMode !== 'view'}
        initialData={editInitialData}
        onModeChange={setAppointmentModalMode}
        appointmentStatus={editInitialData?.status || state.selectedAppointment?.status}
        canEdit={state.selectedAppointment?.can_edit !== false}
        canDelete={state.selectedAppointment?.can_delete !== false}
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

      <DeleteConfirmModal
        isOpen={Boolean(pendingCancelAppointment)}
        appointment={pendingCancelAppointment}
        onConfirm={async () => {
          const apt = pendingCancelAppointment;
          setPendingCancelAppointment(null);
          if (!apt) return;
          await updateStatusWithUndo(apt, 'cancelled');
        }}
        onClose={() => setPendingCancelAppointment(null)}
      />

      <ConflictWarningModal
        isOpen={showConflictModal}
        conflicts={conflictData.conflicts}
        suggestions={conflictData.suggestions}
        onClose={() => {
          pendingRescheduleIdRef.current = null;
          setShowConflictModal(false);
        }}
        onSelectSlot={async (startTime, endTime) => {
          setShowConflictModal(false);

          if (pendingRescheduleIdRef.current !== null) {
            const id = pendingRescheduleIdRef.current;
            pendingRescheduleIdRef.current = null;
            const result = await updateAppointment(id, { startTime, endTime });
            if (result.ok) {
              refetch();
              toast.success('Programarea a fost mutata.');
            } else if (result.status === 409) {
              pendingRescheduleIdRef.current = id;
              setConflictData({
                conflicts: result.conflicts || [],
                suggestions: result.suggestions || [],
              });
              setShowConflictModal(true);
              toast.warning(result.error || 'Intervalul ales intra in conflict.');
            } else {
              toast.error(result.error || 'Nu s-a putut muta programarea.');
            }
            return;
          }

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
