'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import styles from '../../../page.module.css';
import { CalendarPickerSection } from './sections/CalendarPickerSection';
import { CategorySection } from './sections/CategorySection';
import { ClientSection } from './sections/ClientSection';
import { ServiceSection } from './sections/ServiceSection';
import { TimeSection } from './sections/TimeSection';
import {
  appointmentFormReducer,
  buildInitialState,
  composeIso,
  computeDurationMinutes,
  validate,
  type AppointmentFormState,
} from './reducer';
import { useAppointmentSubmit } from './useAppointmentSubmit';
import { useDentistServices } from './useDentistServices';
import type {
  AppointmentFormPayload,
  AppointmentInitialData,
  AppointmentModalMode,
  AppointmentService,
  CalendarOption,
} from './types';

interface AppointmentModalProps {
  isOpen: boolean;
  mode: AppointmentModalMode;
  title?: string;
  submitLabel?: string;
  selectedSlot?: { start: Date; end: Date } | null;
  services: AppointmentService[];
  calendarOptions: CalendarOption[];
  activeCalendarId?: number | null;
  lockCalendarSelection?: boolean;
  currentUserId?: number;
  currentUserDbUserId?: string | null;
  initialData?: AppointmentInitialData | null;
  allowRecurring?: boolean;
  appointmentStatus?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  onModeChange?: (mode: AppointmentModalMode) => void;
  onDelete?: () => void;
  onClose: () => void;
  onSubmit: (payload: AppointmentFormPayload) => Promise<void>;
}

export function AppointmentModal({
  isOpen,
  mode,
  title,
  submitLabel,
  selectedSlot,
  services,
  calendarOptions,
  activeCalendarId,
  lockCalendarSelection = false,
  currentUserId,
  currentUserDbUserId,
  initialData,
  allowRecurring = true,
  appointmentStatus,
  canEdit = true,
  canDelete = true,
  onModeChange,
  onDelete,
  onClose,
  onSubmit,
}: AppointmentModalProps) {
  const readOnly = mode === 'view';
  const noWritableCalendars = mode === 'create' && calendarOptions.length === 0;
  const [state, dispatch] = useReducer(
    appointmentFormReducer,
    undefined as unknown as AppointmentFormState,
    () =>
      buildInitialState({
        initialData: initialData || undefined,
        selectedSlot,
        fallbackCalendarId: activeCalendarId ?? null,
      })
  );

  // Reset form whenever the modal opens, the mode changes, or the target appointment changes.
  const lastOpenKeyRef = useRef<string>('');
  useEffect(() => {
    if (!isOpen) return;
    const key = `${mode}|${initialData ? JSON.stringify(initialData) : ''}|${selectedSlot?.start?.toISOString() || ''}|${selectedSlot?.end?.toISOString() || ''}|${activeCalendarId ?? ''}`;
    if (lastOpenKeyRef.current === key) return;
    lastOpenKeyRef.current = key;
    dispatch({
      type: 'RESET',
      payload: buildInitialState({
        initialData: initialData || undefined,
        selectedSlot,
        fallbackCalendarId: activeCalendarId ?? null,
      }),
    });
  }, [isOpen, mode, initialData, selectedSlot, activeCalendarId]);

  // Seed calendar once if none selected and we have a sensible default.
  const seededCalendarRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      seededCalendarRef.current = false;
      return;
    }
    if (seededCalendarRef.current) return;
    if (state.calendarId) {
      seededCalendarRef.current = true;
      return;
    }
    const firstUsable = calendarOptions.find((c) => !c.disabled);
    if (firstUsable) {
      seededCalendarRef.current = true;
      dispatch({ type: 'SET_CALENDAR', calendarId: String(firstUsable.id) });
    }
  }, [isOpen, state.calendarId, calendarOptions]);

  // True when the currently selected calendar is owned by someone else
  // (i.e. the user is acting as a share recipient).
  const numericCalendarId = useMemo(() => {
    const n = Number.parseInt(state.calendarId, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [state.calendarId]);

  const numericDentistUserId = useMemo(() => {
    const n = Number.parseInt(state.dentistUserId, 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  }, [state.dentistUserId]);

  const isSharedCalendar = useMemo(() => {
    if (!numericCalendarId) return false;
    const opt = calendarOptions.find((c) => c.id === numericCalendarId);
    return opt ? opt.isOwn === false : false;
  }, [numericCalendarId, calendarOptions]);

  const {
    dentists,
    selectedDentist,
    loadingDentists,
    dentistError,
    effectiveServices,
    loadingServices,
    servicesError,
  } = useDentistServices({
    isOpen,
    calendarId: state.calendarId,
    dentistUserId: state.dentistUserId,
    ownServices: services,
    currentUserId,
    currentUserDbUserId,
  });

  // True when creating for the current user — only then can a new patient be created.
  const isOwnDentist = selectedDentist ? selectedDentist.isCurrentUser : !isSharedCalendar;

  // When calendar changes, drop any previously selected service — it belonged to
  // a different dentist/calendar context.
  const prevCalendarRef = useRef(state.calendarId);
  useEffect(() => {
    if (prevCalendarRef.current !== state.calendarId) {
      prevCalendarRef.current = state.calendarId;
      if (state.serviceId) dispatch({ type: 'RESET_SERVICE' });
    }
  }, [state.calendarId, state.serviceId]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const { submit } = useAppointmentSubmit(onSubmit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);

  const selectedCalendarOption = useMemo(
    () => calendarOptions.find((c) => String(c.id) === state.calendarId) || null,
    [calendarOptions, state.calendarId]
  );
  // Category picker is only meaningful for personal calendars.
  const showCategoryPicker = Boolean(selectedCalendarOption?.isOwn);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isSubmitting) return;
    if (event.target === event.currentTarget) onClose();
  };
  const handleModalClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape' || isSubmitting) return;
      if (clientDropdownOpen) {
        return;
      }

      onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [clientDropdownOpen, isOpen, isSubmitting, onClose]);

  useEffect(() => {
    if (isOpen) return;
    setClientDropdownOpen(false);
  }, [isOpen]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly || isSubmitting) return;
    if (noWritableCalendars) {
      dispatch({
        type: 'SET_ERROR',
        error: 'Nu exista calendare disponibile pentru creare.',
      });
      return;
    }
    const error = validate(state);
    if (error) {
      dispatch({ type: 'SET_ERROR', error });
      return;
    }
    dispatch({ type: 'SET_ERROR', error: null });

    const startIso = composeIso(state.date, state.startTime);
    const endIso = composeIso(state.date, state.endTime);
    if (!startIso || !endIso) {
      dispatch({ type: 'SET_ERROR', error: 'Data si ora nu sunt valide.' });
      return;
    }

    const calendarIdNum = Number.parseInt(state.calendarId, 10) || undefined;
    const dentistIdNum = Number.parseInt(state.dentistUserId, 10) || undefined;
    const durationMinutes = computeDurationMinutes(state.startTime, state.endTime);
    const selectedService = effectiveServices.find((s) => String(s.id) === state.serviceId);

    // Only send a category when it's relevant (personal calendar).
    // Send null explicitly to clear a previously-set category; undefined would
    // be stripped by JSON.stringify and the DB update would be skipped.
    const categoryToSend = showCategoryPicker
      ? (state.category !== '' ? state.category : null)
      : initialData?.category;

    const payload: AppointmentFormPayload = {
      clientName: state.clientName.trim(),
      clientEmail: state.clientEmail.trim() || '',
      clientPhone: state.clientPhone.trim() || '',
      calendarId: calendarIdNum,
      calendarName: selectedCalendarOption?.name,
      dentistUserId: dentistIdNum,
      dentistDisplayName: selectedDentist?.displayName,
      serviceId: state.serviceId,
      serviceName: selectedService?.name,
      startTime: startIso,
      endTime: endIso,
      durationMinutes,
      notes: state.notes.trim(),
      status: state.status,
      category: categoryToSend,
      color: initialData?.color,
      clientId: state.selectedClientId,
      // In create mode with no linked client, force-new skips fuzzy dedup —
      // the badge already told the user "new client will be created".
      // In edit mode never force-new: a name keystroke shouldn't create a
      // duplicate if the user only fixed a typo on an existing linked client.
      forceNewClient: mode === 'create' && state.selectedClientId === null,
      isRecurring: state.isRecurring,
      recurrence: state.isRecurring
        ? {
            frequency: state.recurrence.frequency,
            interval: state.recurrence.interval,
            endType: state.recurrence.endType,
            ...(state.recurrence.endType === 'count'
              ? { count: state.recurrence.count }
              : { endDate: state.recurrence.endDate }),
          }
        : undefined,
    };

    setIsSubmitting(true);
    const result = await submit(payload);
    if (!isMountedRef.current) return;
    setIsSubmitting(false);
    if (!result.ok) {
      dispatch({ type: 'SET_ERROR', error: result.error });
    }
  };

  const resolvedTitle = useMemo(() => {
    if (title) return title;
    if (mode === 'view') return 'Detalii programare';
    if (mode === 'edit') return 'Editeaza programare';
    return 'Creeaza programare';
  }, [title, mode]);

  const resolvedSubmitLabel = submitLabel || (mode === 'edit' ? 'Salveaza modificarile' : 'Salveaza');

  if (!isOpen) return null;

  return (
    <div
      className={styles.modalOverlay}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={resolvedTitle}
    >
      <div
        className={`${styles.modal} ${styles.modalWide}`}
        onClick={handleModalClick}
      >
        <div className={styles.modalHeader}>
          <h3>{resolvedTitle}</h3>
          <div className={styles.modalHeaderActions}>
            {mode === 'view' && canEdit && onModeChange && (
              <button
                type="button"
                className={styles.modalIconButton}
                onClick={() => onModeChange('edit')}
                aria-label="Editeaza"
                title="Editeaza"
              >
                ✎
              </button>
            )}
            {mode === 'view' && canDelete && onDelete && (
              <button
                type="button"
                className={`${styles.modalIconButton} ${styles.modalIconButtonDanger}`}
                onClick={onDelete}
                aria-label="Sterge"
                title="Sterge"
              >
                ✕
              </button>
            )}
            <button
              type="button"
              className={styles.closeButton}
              onClick={onClose}
              aria-label="Inchide"
              disabled={isSubmitting}
            >
              ×
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <fieldset className={styles.modalFieldset} disabled={isSubmitting}>
            <div className={styles.modalContent}>
              {appointmentStatus && readOnly && (
                <div className={styles.modalField}>
                  <label>Status</label>
                  <div className={styles.previewValue}>{appointmentStatus}</div>
                </div>
              )}

              <div className={styles.modalGrid}>
                <div className={styles.modalGridCol}>
                  <CalendarPickerSection
                    calendarOptions={calendarOptions}
                    calendarId={state.calendarId}
                    onCalendarChange={(id) =>
                      dispatch({ type: 'SET_CALENDAR', calendarId: id })
                    }
                    dentists={dentists}
                    dentistUserId={state.dentistUserId}
                    onDentistChange={(id) =>
                      dispatch({ type: 'SET_DENTIST', dentistUserId: id })
                    }
                    loadingDentists={loadingDentists}
                    dentistError={dentistError}
                    lockCalendar={lockCalendarSelection}
                    disabled={isSubmitting}
                    readOnly={readOnly}
                  />

                  <ServiceSection
                    services={effectiveServices}
                    serviceId={state.serviceId}
                    onSelect={(serviceId, durationMinutes) =>
                      dispatch({ type: 'SET_SERVICE', serviceId, durationMinutes })
                    }
                    loading={loadingServices}
                    error={servicesError}
                    disabled={isSubmitting}
                    readOnly={readOnly}
                    readOnlyName={initialData?.serviceName}
                  />

                  <TimeSection
                    date={state.date}
                    startTime={state.startTime}
                    endTime={state.endTime}
                    onChange={(patch) => dispatch({ type: 'SET_TIME', ...patch })}
                    allowRecurring={allowRecurring}
                    isRecurring={state.isRecurring}
                    onRecurringToggle={(value) =>
                      dispatch({ type: 'SET_IS_RECURRING', value })
                    }
                    recurrence={state.recurrence}
                    onRecurrenceChange={(patch) =>
                      dispatch({ type: 'SET_RECURRENCE', patch })
                    }
                    disabled={isSubmitting}
                    readOnly={readOnly}
                  />
                </div>

                <div className={styles.modalGridCol}>
                  <ClientSection
                    isOpen={isOpen}
                    clientName={state.clientName}
                    clientEmail={state.clientEmail}
                    clientPhone={state.clientPhone}
                    notes={state.notes}
                    selectedClientId={state.selectedClientId}
                    calendarId={numericCalendarId}
                    dentistUserId={numericDentistUserId}
                    isOwnDentist={isOwnDentist}
                    onNameChange={(value) =>
                      dispatch({ type: 'SET_CLIENT_NAME', value })
                    }
                    onFieldChange={(field, value) =>
                      dispatch({ type: 'SET_FIELD', field, value })
                    }
                    onApplySuggestion={(suggestion) =>
                      dispatch({
                        type: 'APPLY_CLIENT_SUGGESTION',
                        clientId: suggestion.id,
                        name: suggestion.name,
                        email: suggestion.email,
                        phone: suggestion.phone,
                      })
                    }
                    onClearLink={() => dispatch({ type: 'CLEAR_CLIENT_LINK' })}
                    onDropdownOpenChange={setClientDropdownOpen}
                    disabled={isSubmitting}
                    readOnly={readOnly}
                  />

                  {showCategoryPicker && (
                    <CategorySection
                      category={state.category}
                      onChange={(category) =>
                        dispatch({ type: 'SET_CATEGORY', category })
                      }
                      disabled={isSubmitting}
                      readOnly={readOnly}
                    />
                  )}
                </div>
              </div>

              {state.error && (
                <div className={styles.modalField}>
                  <p className={styles.fieldHint} role="alert">
                    {state.error}
                  </p>
                </div>
              )}
            </div>

            {!readOnly && (
              <div className={styles.modalActions}>
                <button
                  type="button"
                  onClick={onClose}
                  className={styles.cancelButton}
                  disabled={isSubmitting}
                >
                  Renunta
                </button>
                <button
                  type="submit"
                  className={styles.saveButton}
                  disabled={isSubmitting || noWritableCalendars}
                >
                  {isSubmitting ? 'Se salveaza...' : resolvedSubmitLabel}
                </button>
              </div>
            )}
          </fieldset>
        </form>
      </div>
    </div>
  );
}
