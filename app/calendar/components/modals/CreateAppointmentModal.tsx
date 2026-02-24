'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from '../../page.module.css';
import { logger } from '@/lib/logger';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';

interface Service {
  id: number;
  name: string;
  duration_minutes: number;
  price: number;
}

const CATEGORIES = [
  { label: 'Consultatie', color: 'var(--color-accent)' },
  { label: 'Tratament', color: 'var(--color-success)' },
  { label: 'Control', color: 'var(--color-accent-strong)' },
  { label: 'Urgenta', color: 'var(--color-danger)' },
  { label: 'Altele', color: 'var(--color-text-soft)' },
] as const;

type AppointmentFormPayload = {
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
  isRecurring?: boolean;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endType: 'date' | 'count';
    endDate?: string;
    count?: number;
  };
};

type RecurrenceForm = {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  endType: 'date' | 'count';
  endDate: string;
  count: number;
};

interface CreateAppointmentModalProps {
  isOpen: boolean;
  selectedSlot: { start: Date; end: Date } | null;
  services: Service[];
  onSeedDemoServices?: () => Promise<void>;
  isSeedingDemoServices?: boolean;
  onClose: () => void;
  onSubmit: (data: AppointmentFormPayload) => Promise<void>;
  mode?: 'create' | 'edit';
  title?: string;
  submitLabel?: string;
  allowRecurring?: boolean;
  initialData?: Partial<AppointmentFormPayload> | null;
}

type ClientSuggestion = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
};

const DEFAULT_RECURRENCE: RecurrenceForm = {
  frequency: 'weekly',
  interval: 1,
  endType: 'count',
  endDate: '',
  count: 4,
};

const MIN_DURATION_MINUTES = 15;
const DEFAULT_DURATION_MINUTES = 30;
const TIME_STEP_MINUTES = 15;

function parseTimeToMinutes(value: string): number | null {
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }
  return hour * 60 + minute;
}

function formatMinutesToTime(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseDateInput(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const parsed = new Date(year, month - 1, day, 0, 0, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function CreateAppointmentModal({
  isOpen,
  selectedSlot,
  services,
  onSeedDemoServices,
  isSeedingDemoServices = false,
  onClose,
  onSubmit,
  mode = 'create',
  title,
  submitLabel,
  allowRecurring = true,
  initialData,
}: CreateAppointmentModalProps) {
  const toast = useToast();
  const backdropPressStartedRef = useRef(false);

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    backdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const endedOnBackdrop = event.target === event.currentTarget;
    if (backdropPressStartedRef.current && endedOnBackdrop) {
      onClose();
    }
    backdropPressStartedRef.current = false;
  };

  const defaultServiceId = useMemo(
    () => (services[0]?.id ? services[0].id.toString() : ''),
    [services]
  );

  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    serviceId: defaultServiceId,
    notes: '',
  });

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceForm>(DEFAULT_RECURRENCE);
  const [selectedDate, setSelectedDate] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [datePickerMonth, setDatePickerMonth] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [isStartTimePickerOpen, setIsStartTimePickerOpen] = useState(false);
  const [selectedEndTime, setSelectedEndTime] = useState('');
  const [isEndTimePickerOpen, setIsEndTimePickerOpen] = useState(false);
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [timeValidationError, setTimeValidationError] = useState('');
  const [clientSuggestions, setClientSuggestions] = useState<ClientSuggestion[]>([]);
  const [showClientSuggestions, setShowClientSuggestions] = useState(false);
  const [loadingClientSuggestions, setLoadingClientSuggestions] = useState(false);
  const [clientSuggestionsError, setClientSuggestionsError] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [showNewClientConfirm, setShowNewClientConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSubmitPayload, setPendingSubmitPayload] = useState<AppointmentFormPayload | null>(null);
  const clientSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const datePickerRef = useRef<HTMLDivElement | null>(null);
  const startTimePickerRef = useRef<HTMLDivElement | null>(null);
  const endTimePickerRef = useRef<HTMLDivElement | null>(null);
  const servicePickerRef = useRef<HTMLDivElement | null>(null);

  const selectedStartDateTime = useMemo(() => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const [hour, minute] = selectedTime.split(':').map(Number);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute)
    ) {
      return selectedSlot?.start || new Date();
    }
    const next = new Date(year, month - 1, day, hour, minute, 0, 0);
    return Number.isNaN(next.getTime()) ? selectedSlot?.start || new Date() : next;
  }, [selectedDate, selectedTime, selectedSlot]);

  const selectedEndDateTime = useMemo(() => {
    const [year, month, day] = selectedDate.split('-').map(Number);
    const [hour, minute] = selectedEndTime.split(':').map(Number);
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      !Number.isFinite(hour) ||
      !Number.isFinite(minute)
    ) {
      const fallback = selectedSlot?.end
        ? new Date(selectedSlot.end)
        : new Date((selectedSlot?.start || new Date()).getTime() + DEFAULT_DURATION_MINUTES * 60_000);
      return Number.isNaN(fallback.getTime())
        ? new Date((selectedSlot?.start || new Date()).getTime() + DEFAULT_DURATION_MINUTES * 60_000)
        : fallback;
    }
    const next = new Date(year, month - 1, day, hour, minute, 0, 0);
    return Number.isNaN(next.getTime())
      ? new Date((selectedSlot?.start || new Date()).getTime() + DEFAULT_DURATION_MINUTES * 60_000)
      : next;
  }, [selectedDate, selectedEndTime, selectedSlot]);

  const endTimeOptions = useMemo(() => {
    const startMinutes = parseTimeToMinutes(selectedTime);
    if (startMinutes === null) {
      return [];
    }
    const options: string[] = [];
    for (
      let minutes = startMinutes + MIN_DURATION_MINUTES;
      minutes <= 23 * 60 + 45;
      minutes += TIME_STEP_MINUTES
    ) {
      options.push(formatMinutesToTime(minutes));
    }
    return options;
  }, [selectedTime]);

  const startTimeOptions = useMemo(() => {
    const options: string[] = [];
    for (let minutes = 0; minutes <= 23 * 60 + 45; minutes += TIME_STEP_MINUTES) {
      options.push(formatMinutesToTime(minutes));
    }
    return options;
  }, []);

  const selectedCalendarDate = useMemo(() => {
    return parseDateInput(selectedDate) || selectedStartDateTime;
  }, [selectedDate, selectedStartDateTime]);

  const selectedService = useMemo(
    () => services.find((service) => String(service.id) === formData.serviceId) || null,
    [services, formData.serviceId]
  );

  const datePickerDays = useMemo(() => {
    const monthStart = startOfMonth(datePickerMonth);
    const monthEnd = endOfMonth(datePickerMonth);
    const weekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const lastWeekStart = startOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: weekStart, end: addDays(lastWeekStart, 6) });
  }, [datePickerMonth]);

  useEffect(() => {
    if (!isOpen) return;
    const initialStart = initialData?.startTime ? new Date(initialData.startTime) : selectedSlot?.start || new Date();
    const initialEnd = initialData?.endTime
      ? new Date(initialData.endTime)
      : selectedSlot?.end || new Date(initialStart.getTime() + DEFAULT_DURATION_MINUTES * 60_000);
    const safeInitialStart = Number.isNaN(initialStart.getTime()) ? new Date() : initialStart;
    const safeInitialEnd = Number.isNaN(initialEnd.getTime())
      ? new Date(safeInitialStart.getTime() + DEFAULT_DURATION_MINUTES * 60_000)
      : initialEnd;
    setFormData({
      clientName: initialData?.clientName || '',
      clientEmail: initialData?.clientEmail || '',
      clientPhone: initialData?.clientPhone || '',
      serviceId: initialData?.serviceId || defaultServiceId,
      notes: initialData?.notes || '',
    });
    setSelectedDate(format(safeInitialStart, 'yyyy-MM-dd'));
    setDatePickerMonth(new Date(safeInitialStart));
    setSelectedTime(format(safeInitialStart, 'HH:mm'));
    setSelectedEndTime(format(safeInitialEnd, 'HH:mm'));
    setIsDatePickerOpen(false);
    setIsStartTimePickerOpen(false);
    setIsEndTimePickerOpen(false);
    setIsServicePickerOpen(false);
    setTimeValidationError('');
    setClientSuggestions([]);
    setClientSuggestionsError('');
    setShowClientSuggestions(false);
    setSelectedClientId(null);
    setShowNewClientConfirm(false);
    setPendingSubmitPayload(null);
    setSelectedCategory(initialData?.category || '');
    setIsRecurring(Boolean(initialData?.isRecurring) && allowRecurring);
    setRecurrence({
      ...DEFAULT_RECURRENCE,
      ...(initialData?.recurrence || {}),
    });
  }, [isOpen, initialData, defaultServiceId, allowRecurring]);

  useEffect(() => {
    if (!isDatePickerOpen && !isStartTimePickerOpen && !isEndTimePickerOpen && !isServicePickerOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedDatePicker = datePickerRef.current?.contains(target);
      const clickedStartTimePicker = startTimePickerRef.current?.contains(target);
      const clickedEndTimePicker = endTimePickerRef.current?.contains(target);
      const clickedServicePicker = servicePickerRef.current?.contains(target);

      if (!clickedDatePicker) {
        setIsDatePickerOpen(false);
      }
      if (!clickedStartTimePicker) {
        setIsStartTimePickerOpen(false);
      }
      if (!clickedEndTimePicker) {
        setIsEndTimePickerOpen(false);
      }
      if (!clickedServicePicker) {
        setIsServicePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isDatePickerOpen, isStartTimePickerOpen, isEndTimePickerOpen, isServicePickerOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!formData.serviceId && defaultServiceId) {
      setFormData((prev) => ({
        ...prev,
        serviceId: defaultServiceId,
      }));
    }
  }, [isOpen, formData.serviceId, defaultServiceId, services]);

  useEffect(() => {
    if (!isOpen) return;
    const startMinutes = parseTimeToMinutes(selectedTime);
    const endMinutes = parseTimeToMinutes(selectedEndTime);
    const fallback = endTimeOptions[0] || '';
    if (startMinutes === null) return;
    if (!fallback) {
      setSelectedEndTime('');
      setTimeValidationError('Ora de inceput este prea tarzie pentru durata minima de 15 minute.');
      return;
    }
    if (endMinutes === null) {
      setSelectedEndTime(fallback);
      setTimeValidationError('');
      return;
    }
    if (endMinutes <= startMinutes) {
      setSelectedEndTime(fallback);
      setTimeValidationError('');
      return;
    }
    setTimeValidationError('');
  }, [isOpen, selectedTime, selectedEndTime, endTimeOptions]);

  useEffect(() => {
    if (!isOpen) return;
    const query = formData.clientName.trim();
    if (query.length < 2) {
      setClientSuggestions([]);
      setLoadingClientSuggestions(false);
      setClientSuggestionsError('');
      return;
    }

    if (clientSearchDebounceRef.current) {
      clearTimeout(clientSearchDebounceRef.current);
    }

    clientSearchDebounceRef.current = setTimeout(async () => {
      try {
        setLoadingClientSuggestions(true);
        const params = new URLSearchParams({
          search: query,
          page: '1',
          limit: '20',
          sortBy: 'last_activity_date',
          sortOrder: 'DESC',
        });
        const response = await fetch(`/api/clients?${params.toString()}`, { cache: 'no-store' });
        if (!response.ok) {
          setClientSuggestionsError('Eroare la cautarea clientilor existenti.');
          return;
        }
        const result = await response.json();
        const suggestions = Array.isArray(result.clients) ? result.clients : [];
        setClientSuggestions(
          suggestions.map((item: any) => ({
            id: item.id,
            name: item.name || '',
            email: item.email || null,
            phone: item.phone || null,
          }))
        );
        setClientSuggestionsError('');
      } catch (error) {
        logger.error(
          'Calendar modal: failed to fetch client suggestions',
          error instanceof Error ? error : new Error(String(error))
        );
        setClientSuggestionsError('Eroare la cautarea clientilor existenti.');
      } finally {
        setLoadingClientSuggestions(false);
      }
    }, 220);

    return () => {
      if (clientSearchDebounceRef.current) {
        clearTimeout(clientSearchDebounceRef.current);
      }
    };
  }, [formData.clientName, isOpen]);

  const applyClientSuggestion = (client: ClientSuggestion) => {
    setFormData((prev) => ({
      ...prev,
      clientName: client.name || prev.clientName,
      clientEmail: client.email || prev.clientEmail,
      clientPhone: client.phone || prev.clientPhone,
    }));
    setSelectedClientId(client.id);
    setShowClientSuggestions(false);
  };

  if (!isOpen || !selectedSlot) return null;

  const modalTitle = title || (mode === 'edit' ? 'Editeaza programare' : 'Creeaza programare');
  const modalSubmitLabel = submitLabel || (mode === 'edit' ? 'Salveaza modificarile' : 'Salveaza');
  const activeCategoryColor = CATEGORIES.find((c) => c.label === selectedCategory)?.color;

  const submitPayload = async (payload: AppointmentFormPayload) => {
    await onSubmit(payload);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!formData.clientName.trim()) {
      toast.error('Introduceti numele clientului.');
      return;
    }
    if (!formData.serviceId) {
      toast.error('Selectati un serviciu.');
      return;
    }
    if (selectedEndDateTime <= selectedStartDateTime) {
      setTimeValidationError('Ora de final trebuie sa fie dupa ora de inceput.');
      return;
    }

    const durationMinutes = Math.max(
      MIN_DURATION_MINUTES,
      Math.round((selectedEndDateTime.getTime() - selectedStartDateTime.getTime()) / 60_000)
    );
    setTimeValidationError('');
    const payload: AppointmentFormPayload = {
      ...formData,
      clientName: formData.clientName.trim(),
      startTime: selectedStartDateTime.toISOString(),
      endTime: selectedEndDateTime.toISOString(),
      durationMinutes,
      category: selectedCategory || undefined,
      color: activeCategoryColor,
      isRecurring: allowRecurring ? isRecurring : false,
      ...(allowRecurring && isRecurring ? { recurrence } : {}),
    };

    const normalizedName = formData.clientName.trim().toLowerCase();
    const normalizedEmail = (formData.clientEmail || '').trim().toLowerCase();
    const normalizedPhone = (formData.clientPhone || '').replace(/\s+/g, '');
    const hasExactSuggestionMatch = clientSuggestions.some((client) => {
      const clientName = (client.name || '').trim().toLowerCase();
      const clientEmail = (client.email || '').trim().toLowerCase();
      const clientPhone = (client.phone || '').replace(/\s+/g, '');
      const matchByName = normalizedName.length > 0 && clientName === normalizedName;
      const matchByEmail =
        normalizedEmail.length > 0 && clientEmail.length > 0 && clientEmail === normalizedEmail;
      const matchByPhone =
        normalizedPhone.length > 0 && clientPhone.length > 0 && clientPhone === normalizedPhone;
      return matchByName || matchByEmail || matchByPhone;
    });
    const shouldConfirmNewClient =
      mode === 'create' && !selectedClientId && !hasExactSuggestionMatch && normalizedName.length > 0;

    if (shouldConfirmNewClient) {
      setPendingSubmitPayload(payload);
      setShowNewClientConfirm(true);
      return;
    }

    setIsSubmitting(true);
    try {
      await submitPayload(payload);
    } finally {
      setIsSubmitting(false);
    }

    if (mode === 'create') {
      setFormData({
        clientName: '',
        clientEmail: '',
        clientPhone: '',
        serviceId: defaultServiceId,
        notes: '',
      });
      setSelectedDate(format(selectedSlot.start, 'yyyy-MM-dd'));
      setDatePickerMonth(new Date(selectedSlot.start));
      setSelectedTime(format(selectedSlot.start, 'HH:mm'));
      setSelectedEndTime(format(selectedSlot.end, 'HH:mm'));
      setIsDatePickerOpen(false);
      setIsStartTimePickerOpen(false);
      setIsEndTimePickerOpen(false);
      setIsServicePickerOpen(false);
      setTimeValidationError('');
      setClientSuggestions([]);
      setClientSuggestionsError('');
      setShowClientSuggestions(false);
      setSelectedClientId(null);
      setSelectedCategory('');
      setIsRecurring(false);
      setRecurrence(DEFAULT_RECURRENCE);
    }
  };

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        className={`${styles.modal} ${styles.createSheet}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
      >
        <h3>{modalTitle}</h3>
        <div className={styles.modalContent}>
          <div className={styles.modalField}>
            <label>Data si ora</label>
            <div>
              {format(selectedStartDateTime, "EEEE, d MMMM yyyy", { locale: ro })}
              {` (${format(selectedStartDateTime, 'HH:mm', { locale: ro })} - ${format(selectedEndDateTime, 'HH:mm', { locale: ro })})`}
            </div>
          </div>

          <div className={styles.modalField}>
            <label>Data</label>
            <div className={styles.modalDatePicker} ref={datePickerRef}>
              <button
                type="button"
                className={styles.modalDateButton}
                onClick={() => setIsDatePickerOpen((prev) => !prev)}
                aria-haspopup="dialog"
                aria-expanded={isDatePickerOpen}
              >
                <span>{format(selectedCalendarDate, 'dd-MMM-yyyy', { locale: ro })}</span>
                <span className={styles.modalDateButtonIcon}>▾</span>
              </button>

              {isDatePickerOpen && (
                <div className={`${styles.clientSuggestions} ${styles.modalDatePopover}`} role="dialog" aria-label="Selecteaza data">
                  <div className={styles.modalDateHeader}>
                    <button
                      type="button"
                      className={styles.modalDateNav}
                      onClick={() => setDatePickerMonth((prev) => subMonths(prev, 1))}
                      aria-label="Luna anterioara"
                    >
                      {'<'}
                    </button>
                    <span className={styles.modalDateMonthLabel}>
                      {format(datePickerMonth, 'MMMM yyyy', { locale: ro })}
                    </span>
                    <button
                      type="button"
                      className={styles.modalDateNav}
                      onClick={() => setDatePickerMonth((prev) => addMonths(prev, 1))}
                      aria-label="Luna urmatoare"
                    >
                      {'>'}
                    </button>
                  </div>

                  <div className={styles.modalDateGrid}>
                    {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, index) => (
                      <span key={`${label}-${index}`} className={styles.modalDateWeekLabel}>
                        {label}
                      </span>
                    ))}
                    {datePickerDays.map((day) => {
                      const inCurrentMonth = isSameMonth(day, datePickerMonth);
                      const isSelected = isSameDay(day, selectedCalendarDate);
                      const isCurrentDay = isToday(day);
                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          className={[
                            styles.modalDateDay,
                            !inCurrentMonth ? styles.modalDateDayOther : '',
                            isCurrentDay ? styles.modalDateDayToday : '',
                            isSelected ? styles.modalDateDaySelected : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            setSelectedDate(format(day, 'yyyy-MM-dd'));
                            setDatePickerMonth(day);
                            setIsDatePickerOpen(false);
                          }}
                          aria-label={format(day, 'd MMMM yyyy', { locale: ro })}
                        >
                          {format(day, 'd')}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.modalFieldRow}>
            <div className={styles.modalField}>
              <label>Ora inceput</label>
              <div className={styles.modalTimePicker} ref={startTimePickerRef}>
                <button
                  type="button"
                  className={styles.modalTimeButton}
                  onClick={() => {
                    setIsStartTimePickerOpen((prev) => !prev);
                    setIsEndTimePickerOpen(false);
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={isStartTimePickerOpen}
                >
                  <span>{selectedTime}</span>
                  <span className={styles.modalTimeButtonIcon}>▾</span>
                </button>

                {isStartTimePickerOpen && (
                  <div className={`${styles.clientSuggestions} ${styles.modalTimePopover}`} role="dialog" aria-label="Selecteaza ora de inceput">
                    <div className={styles.modalTimeList}>
                      {startTimeOptions.map((time) => (
                        <button
                          key={time}
                          type="button"
                          className={`${styles.clientSuggestionItem} ${styles.modalTimeOption} ${time === selectedTime ? styles.modalTimeOptionSelected : ''}`}
                          onClick={() => {
                            setSelectedTime(time);
                            setTimeValidationError('');
                            setIsStartTimePickerOpen(false);
                          }}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.modalField}>
              <label>Ora final</label>
              <div className={styles.modalTimePicker} ref={endTimePickerRef}>
                <button
                  type="button"
                  className={styles.modalTimeButton}
                  onClick={() => {
                    if (endTimeOptions.length === 0) return;
                    setIsEndTimePickerOpen((prev) => !prev);
                    setIsStartTimePickerOpen(false);
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={isEndTimePickerOpen}
                  disabled={endTimeOptions.length === 0}
                >
                  <span>{selectedEndTime || (endTimeOptions.length === 0 ? 'Ora prea tarzie' : 'Selecteaza ora')}</span>
                  <span className={styles.modalTimeButtonIcon}>▾</span>
                </button>

                {isEndTimePickerOpen && endTimeOptions.length > 0 && (
                  <div className={`${styles.clientSuggestions} ${styles.modalTimePopover}`} role="dialog" aria-label="Selecteaza ora de final">
                    <div className={styles.modalTimeList}>
                      {endTimeOptions.map((time) => (
                        <button
                          key={time}
                          type="button"
                          className={`${styles.clientSuggestionItem} ${styles.modalTimeOption} ${time === selectedEndTime ? styles.modalTimeOptionSelected : ''}`}
                          onClick={() => {
                            setSelectedEndTime(time);
                            setTimeValidationError('');
                            setIsEndTimePickerOpen(false);
                          }}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {timeValidationError && (
                <div className={styles.clientSuggestionError}>{timeValidationError}</div>
              )}
            </div>
          </div>

          <div className={styles.modalField}>
            <label>Nume client *</label>
            <input
              type="text"
              value={formData.clientName}
              onFocus={() => setShowClientSuggestions(true)}
              onChange={(e) => {
                setFormData({ ...formData, clientName: e.target.value });
                setSelectedClientId(null);
                setShowClientSuggestions(true);
              }}
              required
            />
            {showClientSuggestions && (loadingClientSuggestions || clientSuggestions.length > 0) && (
              <div className={styles.clientSuggestions}>
                {loadingClientSuggestions && (
                  <div className={styles.clientSuggestionMuted}>Se cauta clienti...</div>
                )}
                {!loadingClientSuggestions &&
                  clientSuggestions.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className={styles.clientSuggestionItem}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyClientSuggestion(client)}
                    >
                      <span className={styles.clientSuggestionName}>{client.name}</span>
                      <span className={styles.clientSuggestionMeta}>
                        {client.email || 'fara email'} | {client.phone || 'fara telefon'}
                      </span>
                    </button>
                  ))}
              </div>
            )}
            {clientSuggestionsError && (
              <div className={styles.clientSuggestionError}>{clientSuggestionsError}</div>
            )}
            <div className={styles.clientSuggestionHint}>
              Daca nu selectezi un client existent, unul nou va fi creat automat.
            </div>
          </div>

          <div className={styles.modalField}>
            <label>Email</label>
            <input
              type="email"
              value={formData.clientEmail}
              onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
            />
          </div>

          <div className={styles.modalField}>
            <label>Telefon</label>
            <input
              type="tel"
              value={formData.clientPhone}
              onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
            />
          </div>

          <div className={styles.modalField}>
            <label>Serviciu *</label>
            {services.length === 0 ? (
              <div className={styles.serviceSeedBox}>
                <p className={styles.clientSuggestionMuted}>
                  Nu exista servicii definite pentru cabinetul curent.
                </p>
                <button
                  type="button"
                  className={styles.saveButton}
                  onClick={() => onSeedDemoServices?.()}
                  disabled={!onSeedDemoServices || isSeedingDemoServices}
                >
                  {isSeedingDemoServices ? 'Se adauga servicii demo...' : 'Adauga servicii demo (stomatologie)'}
                </button>
              </div>
            ) : (
              <div className={styles.modalServicePicker} ref={servicePickerRef}>
                <button
                  type="button"
                  className={styles.modalServiceButton}
                  onClick={() => setIsServicePickerOpen((prev) => !prev)}
                  aria-haspopup="dialog"
                  aria-expanded={isServicePickerOpen}
                >
                  <span>
                    {selectedService
                      ? `${selectedService.name} (${selectedService.duration_minutes} min) - ${selectedService.price} lei`
                      : 'Selecteaza serviciul'}
                  </span>
                  <span className={styles.modalServiceButtonIcon}>▾</span>
                </button>

                {isServicePickerOpen && (
                  <div className={`${styles.clientSuggestions} ${styles.modalServicePopover}`} role="dialog" aria-label="Selecteaza serviciul">
                    <div className={styles.modalServiceList}>
                      {services.map((service) => (
                        <button
                          key={service.id}
                          type="button"
                          className={`${styles.clientSuggestionItem} ${styles.modalServiceOption} ${String(service.id) === formData.serviceId ? styles.modalServiceOptionSelected : ''}`}
                          onClick={() => {
                            const nextServiceId = String(service.id);
                            const nextDuration = Math.max(
                              MIN_DURATION_MINUTES,
                              service.duration_minutes || DEFAULT_DURATION_MINUTES
                            );
                            const startMinutes = parseTimeToMinutes(selectedTime);
                            if (startMinutes !== null) {
                              const endMinutes = Math.min(startMinutes + nextDuration, 23 * 60 + 45);
                              setSelectedEndTime(formatMinutesToTime(endMinutes));
                            }
                            setFormData({ ...formData, serviceId: nextServiceId });
                            setIsServicePickerOpen(false);
                          }}
                        >
                          {service.name} ({service.duration_minutes} min) - {service.price} lei
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={styles.modalField}>
            <label>Categorie</label>
            <div className={styles.categoryPicker}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.label}
                  type="button"
                  className={`${styles.categoryChip} ${selectedCategory === cat.label ? styles.categoryChipActive : ''}`}
                  style={{ '--chip-color': cat.color } as React.CSSProperties}
                  onClick={() => setSelectedCategory(selectedCategory === cat.label ? '' : cat.label)}
                  title={cat.label}
                >
                  <span className={styles.categoryDot} style={{ background: cat.color }} />
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.modalField}>
            <label>Note</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          {allowRecurring && (
            <>
              <div className={styles.modalField}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                  />
                  <span>Programare recurenta</span>
                </label>
              </div>

              {isRecurring && (
                <div className={styles.recurringOptions}>
                  <div className={styles.modalField}>
                    <label>Frecventa</label>
                    <select
                      value={recurrence.frequency}
                      onChange={(e) => setRecurrence({ ...recurrence, frequency: e.target.value as any })}
                    >
                      <option value="daily">Zilnic</option>
                      <option value="weekly">Saptamanal</option>
                      <option value="monthly">Lunar</option>
                    </select>
                  </div>

                  <div className={styles.modalField}>
                    <label>
                      Interval (la fiecare{' '}
                      {recurrence.frequency === 'daily'
                        ? 'zile'
                        : recurrence.frequency === 'weekly'
                          ? 'saptamani'
                          : 'luni'}
                      )
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="12"
                      value={recurrence.interval}
                      onChange={(e) => setRecurrence({ ...recurrence, interval: parseInt(e.target.value, 10) || 1 })}
                    />
                  </div>

                  <div className={styles.modalField}>
                    <label>Sfarsit</label>
                    <select
                      value={recurrence.endType}
                      onChange={(e) => setRecurrence({ ...recurrence, endType: e.target.value as any })}
                    >
                      <option value="count">Dupa un numar de repetari</option>
                      <option value="date">La o data specifica</option>
                    </select>
                  </div>

                  {recurrence.endType === 'count' && (
                    <div className={styles.modalField}>
                      <label>Numar de repetari</label>
                      <input
                        type="number"
                        min="2"
                        max="52"
                        value={recurrence.count}
                        onChange={(e) => setRecurrence({ ...recurrence, count: parseInt(e.target.value, 10) || 2 })}
                      />
                    </div>
                  )}

                  {recurrence.endType === 'date' && (
                    <div className={styles.modalField}>
                      <label>Data de sfarsit</label>
                      <input
                        type="date"
                        value={recurrence.endDate}
                        onChange={(e) => setRecurrence({ ...recurrence, endDate: e.target.value })}
                        min={format(selectedStartDateTime, 'yyyy-MM-dd')}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className={styles.modalActions}>
          <button onClick={onClose} className={styles.cancelButton}>
            Anuleaza
          </button>
          <button
            onClick={handleSubmit}
            className={styles.saveButton}
            disabled={services.length === 0 || isSubmitting || showNewClientConfirm}
          >
            {modalSubmitLabel}
          </button>
        </div>

        {showNewClientConfirm && (
          <div className={styles.inlineConfirmBox}>
            <p className={styles.inlineConfirmTitle}>Client nou detectat</p>
            <p className={styles.inlineConfirmText}>
              Nu am gasit un client existent pentru <strong>{formData.clientName.trim()}</strong>. Confirmi crearea automata in baza de date?
            </p>
            <div className={styles.inlineConfirmActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => {
                  setShowNewClientConfirm(false);
                  setPendingSubmitPayload(null);
                }}
              >
                Revizuiesc
              </button>
              <button
                type="button"
                className={styles.saveButton}
                disabled={isSubmitting}
                onClick={async () => {
                  if (!pendingSubmitPayload) return;
                  if (isSubmitting) return;
                  setIsSubmitting(true);
                  try {
                    await submitPayload(pendingSubmitPayload);
                  } finally {
                    setIsSubmitting(false);
                  }
                  setShowNewClientConfirm(false);
                  setPendingSubmitPayload(null);
                  if (mode === 'create') {
                    setFormData({
                      clientName: '',
                      clientEmail: '',
                      clientPhone: '',
                      serviceId: defaultServiceId,
                      notes: '',
                    });
                    setSelectedDate(format(selectedSlot.start, 'yyyy-MM-dd'));
                    setDatePickerMonth(new Date(selectedSlot.start));
                    setSelectedTime(format(selectedSlot.start, 'HH:mm'));
                    setSelectedEndTime(format(selectedSlot.end, 'HH:mm'));
                    setIsDatePickerOpen(false);
                    setIsStartTimePickerOpen(false);
                    setIsEndTimePickerOpen(false);
                    setIsServicePickerOpen(false);
                    setTimeValidationError('');
                    setClientSuggestions([]);
                    setClientSuggestionsError('');
                    setShowClientSuggestions(false);
                    setSelectedClientId(null);
                    setSelectedCategory('');
                    setIsRecurring(false);
                    setRecurrence(DEFAULT_RECURRENCE);
                  }
                }}
              >
                Confirma si creeaza client
              </button>
            </div>
          </div>
        )}
      </div>
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}
