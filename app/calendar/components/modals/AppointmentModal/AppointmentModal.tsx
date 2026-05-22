'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import styles from '../../../page.module.css';
import m from './MobileAppointmentSheet.module.css';
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
  type AppointmentFormAction,
  type AppointmentFormState,
} from './reducer';
import { useAppointmentSubmit } from './useAppointmentSubmit';
import { useClientSuggestions } from './useClientSuggestions';
import { useDentistServices } from './useDentistServices';
import { useIsMobile } from '@/lib/useIsMobile';
import { useModal } from '@/lib/useModal';
import { useFocusRestore } from '@/lib/useFocusRestore';
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
  /** True when this specific appointment is one occurrence in a recurring series.
   *  We show a banner so the dentist knows edits/deletes default to "this one only". */
  isRecurringInstance?: boolean;
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
  isRecurringInstance = false,
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

  // Return focus to the trigger element when the modal closes (a11y).
  useFocusRestore(isOpen);

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
  // Categories are scoped to the default personal calendar. Shared and custom
  // calendars keep using dentist colors.
  const showCategoryPicker = Boolean(selectedCalendarOption?.isDefault && selectedCalendarOption?.isOwn !== false);

  const { overlayProps, dialogProps } = useModal({
    isOpen,
    onClose,
    closeDisabled: isSubmitting,
    shouldCloseOnEscape: () => !clientDropdownOpen,
  });

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
    const categoryIdToSend = showCategoryPicker
      ? (state.categoryId !== null ? state.categoryId : (state.category === '' ? null : undefined))
      : initialData?.categoryId;

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
      categoryId: categoryIdToSend,
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

  // On phones, render a Google-Calendar-style bottom sheet instead of the desktop modal.
  // The form state, reducers and submit handler above are reused as-is — only the layout changes.
  const isMobile = useIsMobile();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const toggleExpanded = useCallback((key: string) => {
    setExpandedRow((prev) => (prev === key ? null : key));
  }, []);

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <MobileAppointmentSheet
        mode={mode}
        readOnly={readOnly}
        title={resolvedTitle}
        submitLabel={resolvedSubmitLabel}
        isSubmitting={isSubmitting}
        noWritableCalendars={noWritableCalendars}
        appointmentStatus={appointmentStatus}
        canEdit={canEdit}
        canDelete={canDelete}
        isRecurringInstance={isRecurringInstance}
        allowRecurring={allowRecurring}
        initialData={initialData || undefined}
        state={state}
        dispatch={dispatch}
        calendarOptions={calendarOptions}
        selectedCalendarOption={selectedCalendarOption}
        dentists={dentists}
        selectedDentist={selectedDentist}
        loadingDentists={loadingDentists}
        dentistError={dentistError}
        effectiveServices={effectiveServices}
        loadingServices={loadingServices}
        servicesError={servicesError}
        isOwnDentist={isOwnDentist}
        showCategoryPicker={showCategoryPicker}
        numericCalendarId={numericCalendarId}
        numericDentistUserId={numericDentistUserId}
        lockCalendarSelection={lockCalendarSelection}
        expandedRow={expandedRow}
        toggleExpanded={toggleExpanded}
        setClientDropdownOpen={setClientDropdownOpen}
        clientDropdownOpen={clientDropdownOpen}
        onClose={onClose}
        onModeChange={onModeChange}
        onDelete={onDelete}
        onSubmit={handleSubmit}
      />
    );
  }

  return (
    <div
      className={styles.modalOverlay}
      {...overlayProps}
    >
      <div
        className={`${styles.modal} ${styles.modalWide}`}
        {...dialogProps}
        role="dialog"
        aria-modal="true"
        aria-label={resolvedTitle}
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
              {isRecurringInstance && (
                <div
                  role="note"
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.55rem',
                    padding: '0.6rem 0.8rem',
                    margin: '0 0 0.85rem',
                    background: 'color-mix(in srgb, var(--color-accent) 9%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-accent) 28%, transparent)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.82rem',
                    lineHeight: 1.35,
                    color: 'var(--color-text)',
                  }}
                >
                  <svg
                    width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, marginTop: 2, opacity: 0.75 }} aria-hidden="true"
                  >
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                  <span>
                    Aceasta programare face parte dintr-o serie recurenta. Modificarile salvate aici
                    se aplica <strong>doar acestei aparitii</strong>. Pentru a sterge intreaga serie,
                    foloseste optiunea din dialogul de stergere.
                  </span>
                </div>
              )}

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
                      isOpen={isOpen}
                      calendarId={numericCalendarId}
                      dentistUserId={numericDentistUserId}
                      category={state.category}
                      categoryId={state.categoryId}
                      categoryLabel={initialData?.categoryLabel}
                      categoryColor={initialData?.categoryColor}
                      onChange={(category, categoryId) =>
                        dispatch({ type: 'SET_CATEGORY', category, categoryId })
                      }
                      autoSelectFirst={mode === 'create'}
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

/* ──────────────────────────────────────────────────────────────────────────
   Mobile sheet — Google Calendar-inspired layout
   ──────────────────────────────────────────────────────────────────────── */

interface MobileSheetProps {
  mode: AppointmentModalMode;
  readOnly: boolean;
  title: string;
  submitLabel: string;
  isSubmitting: boolean;
  noWritableCalendars: boolean;
  appointmentStatus?: string;
  canEdit: boolean;
  canDelete: boolean;
  isRecurringInstance: boolean;
  allowRecurring: boolean;
  initialData?: AppointmentInitialData;
  state: AppointmentFormState;
  dispatch: React.Dispatch<AppointmentFormAction>;
  calendarOptions: CalendarOption[];
  selectedCalendarOption: CalendarOption | null;
  dentists: Array<{ userId: number; displayName: string; isCurrentUser?: boolean }>;
  selectedDentist: { userId: number; displayName: string; isCurrentUser?: boolean } | null;
  loadingDentists: boolean;
  dentistError: string | null;
  effectiveServices: AppointmentService[];
  loadingServices: boolean;
  servicesError: string | null;
  isOwnDentist: boolean;
  showCategoryPicker: boolean;
  numericCalendarId: number | null;
  numericDentistUserId: number | null;
  lockCalendarSelection: boolean;
  expandedRow: string | null;
  toggleExpanded: (key: string) => void;
  setClientDropdownOpen: (open: boolean) => void;
  clientDropdownOpen: boolean;
  onClose: () => void;
  onModeChange?: (mode: AppointmentModalMode) => void;
  onDelete?: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}

function MobileAppointmentSheet(props: MobileSheetProps) {
  const {
    mode, readOnly, title, isSubmitting, noWritableCalendars,
    appointmentStatus, canEdit, canDelete, isRecurringInstance, allowRecurring, initialData,
    state, dispatch, calendarOptions, selectedCalendarOption,
    dentists, selectedDentist, loadingDentists, dentistError,
    effectiveServices, loadingServices, servicesError,
    isOwnDentist, showCategoryPicker, numericCalendarId, numericDentistUserId,
    lockCalendarSelection,
    expandedRow, toggleExpanded, setClientDropdownOpen, clientDropdownOpen,
    onClose, onModeChange, onDelete, onSubmit,
  } = props;

  const selectedService = useMemo(
    () => effectiveServices.find((s) => String(s.id) === state.serviceId) || null,
    [effectiveServices, state.serviceId]
  );

  const calendarRowDisabled = lockCalendarSelection || calendarOptions.length <= 1;
  const dentistRowVisible = dentists.length > 1 || loadingDentists || Boolean(dentistError);

  const durationMinutes = useMemo(
    () => computeDurationMinutes(state.startTime, state.endTime),
    [state.startTime, state.endTime]
  );

  // ── Patient autocomplete (re-uses the same hook the desktop ClientSection uses) ──
  const isFocusedNameRef = useRef(false);
  const [nameFocused, setNameFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const {
    suggestions,
    loading: loadingSuggestions,
    resolvedQuery,
    hasExactNameMatch,
    exactMatch,
  } = useClientSuggestions({
    isOpen: nameFocused && !readOnly,
    query: state.clientName,
    calendarId: numericCalendarId,
    dentistUserId: numericDentistUserId,
  });

  // Close dropdown when tapping outside the name row.
  useEffect(() => {
    if (!nameFocused) return;
    const onDocClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) setNameFocused(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [nameFocused]);

  const trimmedName = state.clientName.trim();
  const hasLinkedClient = state.selectedClientId !== null;
  const showSuggestions =
    !readOnly && nameFocused && !hasLinkedClient && (suggestions.length > 0 || loadingSuggestions);
  const showNewClientHint =
    !readOnly && !hasLinkedClient && trimmedName.length >= 2 && resolvedQuery === trimmedName &&
    !hasExactNameMatch && !loadingSuggestions && isOwnDentist;

  // Surface dropdown state to the parent so Escape behaviour matches the desktop sheet.
  useEffect(() => {
    setClientDropdownOpen(showSuggestions);
  }, [showSuggestions, setClientDropdownOpen]);

  // Auto-link if the typed name exactly matches an existing patient (mirrors desktop ClientSection).
  const handleNameBlur = () => {
    isFocusedNameRef.current = false;
    if (hasLinkedClient || !exactMatch || resolvedQuery !== trimmedName || trimmedName.length === 0) return;
    dispatch({
      type: 'APPLY_CLIENT_SUGGESTION',
      clientId: exactMatch.id,
      name: exactMatch.name,
      email: exactMatch.email,
      phone: exactMatch.phone,
    });
  };

  return (
    <Drawer.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      direction="bottom"
      handleOnly
      closeThreshold={0.28}
      dismissible={!isSubmitting}
    >
      <Drawer.Portal>
      <Drawer.Overlay className={m.overlay} />
      <Drawer.Content className={m.sheet} aria-label={title}>
        <form onSubmit={onSubmit} style={{ display: 'contents' }}>
          <fieldset disabled={isSubmitting} style={{ display: 'contents', border: 0, padding: 0, margin: 0 }}>
            {/* ── Top bar ── */}
            <div className={m.topBar}>
              <button
                type="button"
                className={`${m.actionBtn} ${m.actionBtnLeft}`}
                onClick={onClose}
                disabled={isSubmitting}
              >
                {readOnly ? 'Inchide' : 'Anulati'}
              </button>

              <div className={m.topBarCenter}>
                <Drawer.Handle className={m.dragHandle} />
                <Drawer.Title className={m.topBarTitle}>{title}</Drawer.Title>
              </div>

              {readOnly ? (
                <div className={m.headerActionGroup}>
                  {canEdit && onModeChange && (
                    <button
                      type="button"
                      className={m.iconHeaderBtn}
                      onClick={() => onModeChange('edit')}
                      aria-label="Editeaza"
                    >
                      <EditIcon />
                    </button>
                  )}
                  {canDelete && onDelete && (
                    <button
                      type="button"
                      className={`${m.iconHeaderBtn} ${m.iconHeaderBtnDanger}`}
                      onClick={onDelete}
                      aria-label="Sterge"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="submit"
                  className={`${m.actionBtn} ${m.actionBtnPrimary}`}
                  disabled={isSubmitting || noWritableCalendars}
                >
                  {isSubmitting ? 'Salvare...' : 'Salveaza'}
                </button>
              )}
            </div>

            {/* ── Body ── */}
            <div className={m.body}>
              {isRecurringInstance && (
                <div className={m.banner} role="note">
                  <RecurringIcon className={m.bannerIcon} />
                  <span>
                    Aceasta programare face parte dintr-o serie recurenta. Modificarile salvate aici
                    se aplica <strong>doar acestei aparitii</strong>.
                  </span>
                </div>
              )}

              {state.error && (
                <div className={m.error} role="alert">{state.error}</div>
              )}

              {/* Status in view mode */}
              {readOnly && appointmentStatus && (
                <div className={m.section}>
                  <div className={`${m.row} ${m.rowStatic}`}>
                    <span className={m.rowIcon}><StatusIcon /></span>
                    <div className={m.rowMain}>
                      <div className={m.rowLabel}>Status</div>
                      <div className={m.rowValue}>{appointmentStatus}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Time block ── */}
              <div className={m.section}>
                <div className={m.timeBlock}>
                  <span className={m.rowIcon}><ClockIcon /></span>
                  <div className={m.timeBlockMain}>
                    <PickerRow label="Data" disabled={readOnly}>
                      <input
                        type="date"
                        className={m.nativeDateInput}
                        value={state.date}
                        onClick={openMobileNativePicker}
                        onFocus={openMobileNativePicker}
                        onChange={(e) => dispatch({ type: 'SET_TIME', date: e.target.value })}
                        disabled={readOnly}
                      />
                    </PickerRow>
                    <PickerRow label="Inceput" disabled={readOnly}>
                      <input
                        type="time"
                        className={m.nativeTimeInput}
                        value={state.startTime}
                        onClick={openMobileNativePicker}
                        onFocus={openMobileNativePicker}
                        onChange={(e) => dispatch({ type: 'SET_TIME', startTime: e.target.value })}
                        disabled={readOnly}
                      />
                    </PickerRow>
                    <PickerRow label="Sfarsit" disabled={readOnly}>
                      <input
                        type="time"
                        className={m.nativeTimeInput}
                        value={state.endTime}
                        onClick={openMobileNativePicker}
                        onFocus={openMobileNativePicker}
                        onChange={(e) => dispatch({ type: 'SET_TIME', endTime: e.target.value })}
                        disabled={readOnly}
                      />
                    </PickerRow>
                    {durationMinutes > 0 && (
                      <div className={m.timeDuration}>Durata: {durationMinutes} min</div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Patient name + autocomplete ── */}
              <div className={m.section} ref={wrapperRef}>
                <div className={m.inputRowWithLabel}>
                  <span className={m.rowIcon}><UserIcon /></span>
                  <div className={m.inputRowMain}>
                    <div className={m.inputRowLabel}>Pacient *</div>
                    <div className={m.autocompleteWrapper}>
                      {readOnly ? (
                        <div style={{ fontSize: '0.98rem', color: 'var(--color-text)' }}>
                          {state.clientName || '—'}
                        </div>
                      ) : hasLinkedClient ? (
                        <div className={m.linkedBadge}>
                          <span>✓ {state.clientName}</span>
                          <button
                            type="button"
                            className={m.linkedBadgeClear}
                            onClick={() => dispatch({ type: 'CLEAR_CLIENT_LINK' })}
                            aria-label="Deconecteaza pacientul existent"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            className={m.inputBare}
                            value={state.clientName}
                            placeholder="Ion Popescu"
                            onChange={(e) => dispatch({ type: 'SET_CLIENT_NAME', value: e.target.value })}
                            onFocus={() => { isFocusedNameRef.current = true; setNameFocused(true); }}
                            onBlur={handleNameBlur}
                            maxLength={255}
                            autoComplete="off"
                            disabled={readOnly}
                          />
                          {showSuggestions && (
                            <div className={m.autocomplete} role="listbox">
                              {loadingSuggestions && suggestions.length === 0 ? (
                                <div className={m.autocompleteEmpty}>Se cauta...</div>
                              ) : (
                                suggestions.map((s) => (
                                  <button
                                    key={s.id}
                                    type="button"
                                    className={m.autocompleteItem}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      dispatch({
                                        type: 'APPLY_CLIENT_SUGGESTION',
                                        clientId: s.id,
                                        name: s.name,
                                        email: s.email,
                                        phone: s.phone,
                                      });
                                      setNameFocused(false);
                                    }}
                                  >
                                    <span className={m.autocompleteName}>{s.name}</span>
                                    {(s.email || s.phone) && (
                                      <span className={m.autocompleteMeta}>
                                        {[s.phone, s.email].filter(Boolean).join(' · ')}
                                      </span>
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                          {showNewClientHint && (
                            <div className={m.newClientBadge}>Pacient nou — va fi creat la salvare</div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Email */}
                <div className={m.inputRowWithLabel}>
                  <span className={m.rowIcon}><MailIcon /></span>
                  <div className={m.inputRowMain}>
                    <div className={m.inputRowLabel}>Email</div>
                    {readOnly ? (
                      <div style={{ fontSize: '0.95rem', color: 'var(--color-text)' }}>
                        {state.clientEmail || '—'}
                      </div>
                    ) : (
                      <input
                        type="email"
                        className={m.inputBare}
                        value={state.clientEmail}
                        placeholder="ion@example.com"
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'clientEmail', value: e.target.value })}
                        autoComplete="off"
                        disabled={readOnly}
                      />
                    )}
                  </div>
                </div>

                {/* Phone */}
                <div className={m.inputRowWithLabel}>
                  <span className={m.rowIcon}><PhoneIcon /></span>
                  <div className={m.inputRowMain}>
                    <div className={m.inputRowLabel}>Telefon</div>
                    {readOnly ? (
                      <div style={{ fontSize: '0.95rem', color: 'var(--color-text)' }}>
                        {state.clientPhone || '—'}
                      </div>
                    ) : (
                      <input
                        type="tel"
                        className={m.inputBare}
                        value={state.clientPhone}
                        placeholder="07xx xxx xxx"
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'clientPhone', value: e.target.value })}
                        autoComplete="off"
                        disabled={readOnly}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* ── Service ── */}
              <div className={m.section}>
                <button
                  type="button"
                  className={m.row}
                  onClick={() => !readOnly && toggleExpanded('service')}
                  disabled={readOnly && !selectedService}
                >
                  <span className={m.rowIcon}><BriefcaseIcon /></span>
                  <div className={m.rowMain}>
                    <div className={m.rowLabel}>Serviciu</div>
                    <div className={m.rowValue}>
                      {selectedService?.name || initialData?.serviceName || (readOnly ? '—' : 'Selecteaza un serviciu')}
                    </div>
                  </div>
                  {!readOnly && (
                    <span className={`${m.rowChevron} ${expandedRow === 'service' ? m.rowChevronOpen : ''}`}>
                      <ChevronRightIcon />
                    </span>
                  )}
                </button>
                {!readOnly && expandedRow === 'service' && (
                  <div className={m.expanded}>
                    {loadingServices ? (
                      <div className={m.autocompleteEmpty}>Se incarca serviciile...</div>
                    ) : servicesError ? (
                      <div className={m.autocompleteEmpty}>{servicesError}</div>
                    ) : effectiveServices.length === 0 ? (
                      <div className={m.autocompleteEmpty}>Nu sunt servicii disponibile</div>
                    ) : (
                      effectiveServices.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`${m.option} ${String(s.id) === state.serviceId ? m.optionSelected : ''}`}
                          onClick={() => {
                            dispatch({ type: 'SET_SERVICE', serviceId: String(s.id), durationMinutes: s.duration_minutes });
                            toggleExpanded('service'); // collapse after pick
                          }}
                        >
                          <span>{s.name}</span>
                          {s.duration_minutes ? (
                            <span className={m.optionMeta}>{s.duration_minutes} min</span>
                          ) : null}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* ── Calendar (when multiple options) ── */}
              {calendarOptions.length > 1 && (
                <div className={m.section}>
                  <button
                    type="button"
                    className={m.row}
                    onClick={() => !calendarRowDisabled && toggleExpanded('calendar')}
                    disabled={calendarRowDisabled}
                  >
                    <span className={m.rowIcon}><CalendarIcon /></span>
                    <div className={m.rowMain}>
                      <div className={m.rowLabel}>Calendar</div>
                      <div className={m.rowValue}>
                        {selectedCalendarOption?.name || 'Selecteaza calendar'}
                      </div>
                    </div>
                    {!calendarRowDisabled && (
                      <span className={`${m.rowChevron} ${expandedRow === 'calendar' ? m.rowChevronOpen : ''}`}>
                        <ChevronRightIcon />
                      </span>
                    )}
                  </button>
                  {!calendarRowDisabled && expandedRow === 'calendar' && (
                    <div className={m.expanded}>
                      {calendarOptions.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className={`${m.option} ${String(c.id) === state.calendarId ? m.optionSelected : ''}`}
                          disabled={c.disabled}
                          onClick={() => {
                            dispatch({ type: 'SET_CALENDAR', calendarId: String(c.id) });
                            toggleExpanded('calendar');
                          }}
                        >
                          <span>{c.name}</span>
                          {c.isOwn === false && <span className={m.optionMeta}>Partajat</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Dentist (when shared calendar with multiple dentists) ── */}
              {dentistRowVisible && (
                <div className={m.section}>
                  <button
                    type="button"
                    className={m.row}
                    onClick={() => !readOnly && !loadingDentists && toggleExpanded('dentist')}
                    disabled={readOnly || loadingDentists}
                  >
                    <span className={m.rowIcon}><StethoscopeIcon /></span>
                    <div className={m.rowMain}>
                      <div className={m.rowLabel}>Medic</div>
                      <div className={m.rowValue}>
                        {loadingDentists ? 'Se incarca...' : (selectedDentist?.displayName || dentistError || 'Selecteaza medicul')}
                      </div>
                    </div>
                    {!readOnly && !loadingDentists && (
                      <span className={`${m.rowChevron} ${expandedRow === 'dentist' ? m.rowChevronOpen : ''}`}>
                        <ChevronRightIcon />
                      </span>
                    )}
                  </button>
                  {!readOnly && expandedRow === 'dentist' && dentists.length > 0 && (
                    <div className={m.expanded}>
                      {dentists.map((d) => (
                        <button
                          key={d.userId}
                          type="button"
                          className={`${m.option} ${String(d.userId) === state.dentistUserId ? m.optionSelected : ''}`}
                          onClick={() => {
                            dispatch({ type: 'SET_DENTIST', dentistUserId: String(d.userId) });
                            toggleExpanded('dentist');
                          }}
                        >
                          <span>{d.displayName}</span>
                          {d.isCurrentUser && <span className={m.optionMeta}>Tu</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Category (only for default personal calendar) ── */}
              {showCategoryPicker && !readOnly && (
                <div className={m.section}>
                  <div className={m.inputRowWithLabel}>
                    <span className={m.rowIcon}><TagIcon /></span>
                    <div className={m.inputRowMain}>
                      <div className={m.inputRowLabel}>Categorie</div>
                      <CategorySection
                        isOpen
                        calendarId={numericCalendarId}
                        dentistUserId={numericDentistUserId}
                        category={state.category}
                        categoryId={state.categoryId}
                        categoryLabel={initialData?.categoryLabel}
                        categoryColor={initialData?.categoryColor}
                        onChange={(category, categoryId) => dispatch({ type: 'SET_CATEGORY', category, categoryId })}
                        autoSelectFirst={mode === 'create'}
                        disabled={isSubmitting}
                        readOnly={readOnly}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ── Recurring toggle + options ── */}
              {allowRecurring && !readOnly && (
                <div className={m.section}>
                  <div className={`${m.row} ${m.rowStatic}`}>
                    <span className={m.rowIcon}><RecurringIcon /></span>
                    <div className={m.rowMain}>
                      <div className={m.rowLabel}>Recurent</div>
                      <div className={m.rowValue}>
                        {state.isRecurring ? 'Se repeta automat' : 'O singura aparitie'}
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={state.isRecurring}
                      onChange={(checked) => dispatch({ type: 'SET_IS_RECURRING', value: checked })}
                    />
                  </div>
                  {state.isRecurring && (
                    <div className={m.expanded}>
                      <div className={m.recurrenceGrid}>
                        <div className={m.recurrenceField}>
                          <label className={m.recurrenceFieldLabel}>Frecventa</label>
                          <select
                            className={m.recurrenceSelect}
                            value={state.recurrence.frequency}
                            onChange={(e) =>
                              dispatch({
                                type: 'SET_RECURRENCE',
                                patch: { frequency: e.target.value as 'daily' | 'weekly' | 'monthly' },
                              })
                            }
                          >
                            <option value="daily">Zilnic</option>
                            <option value="weekly">Saptamanal</option>
                            <option value="monthly">Lunar</option>
                          </select>
                        </div>
                        <div className={m.recurrenceField}>
                          <label className={m.recurrenceFieldLabel}>La fiecare</label>
                          <input
                            type="number"
                            className={m.recurrenceInput}
                            min={1}
                            max={52}
                            value={state.recurrence.interval}
                            onChange={(e) => dispatch({ type: 'SET_RECURRENCE', patch: { interval: Math.max(1, Number(e.target.value) || 1) } })}
                          />
                        </div>
                        <div className={m.recurrenceField}>
                          <label className={m.recurrenceFieldLabel}>Se termina</label>
                          <select
                            className={m.recurrenceSelect}
                            value={state.recurrence.endType}
                            onChange={(e) =>
                              dispatch({
                                type: 'SET_RECURRENCE',
                                patch: { endType: e.target.value as 'count' | 'date' },
                              })
                            }
                          >
                            <option value="count">Dupa N aparitii</option>
                            <option value="date">La o data</option>
                          </select>
                        </div>
                        {state.recurrence.endType === 'count' ? (
                          <div className={m.recurrenceField}>
                            <label className={m.recurrenceFieldLabel}>Nr. aparitii</label>
                            <input
                              type="number"
                              className={m.recurrenceInput}
                              min={1}
                              max={365}
                              value={state.recurrence.count}
                              onChange={(e) => dispatch({ type: 'SET_RECURRENCE', patch: { count: Math.max(1, Number(e.target.value) || 1) } })}
                            />
                          </div>
                        ) : (
                          <div className={m.recurrenceField}>
                            <label className={m.recurrenceFieldLabel}>Data finala</label>
                            <input
                              type="date"
                              className={m.recurrenceInput}
                              value={state.recurrence.endDate}
                              onChange={(e) => dispatch({ type: 'SET_RECURRENCE', patch: { endDate: e.target.value } })}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Notes ── */}
              <div className={m.section}>
                <div className={m.inputRowWithLabel}>
                  <span className={m.rowIcon}><NotesIcon /></span>
                  <div className={m.inputRowMain}>
                    <div className={m.inputRowLabel}>Note</div>
                    {readOnly ? (
                      <div style={{ fontSize: '0.93rem', color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
                        {state.notes || '—'}
                      </div>
                    ) : (
                      <textarea
                        className={m.textareaBare}
                        rows={3}
                        value={state.notes}
                        placeholder="Observatii, alergii, instructiuni speciale..."
                        onChange={(e) => dispatch({ type: 'SET_FIELD', field: 'notes', value: e.target.value })}
                        disabled={readOnly}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </fieldset>
        </form>
      </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ── Icons ──────────────────────────────────────────────────────────────── */

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3 7 12 13 21 7" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function StethoscopeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1.2" />
    </svg>
  );
}

function RecurringIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
    </svg>
  );
}

function StatusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/* ── Time/date picker row ───────────────────────────────────────────────── */
/**
 * The left-side labels are inert. The right-side native input value is the tap
 * target, and showPicker() nudges supported mobile browsers to open the picker.
 */
function openMobileNativePicker(event: React.MouseEvent<HTMLInputElement> | React.FocusEvent<HTMLInputElement>) {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
  if (typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch {
    // Browser only allows showPicker from direct user gestures.
  }
}

function PickerRow({ label, children, disabled }: { label: string; children: React.ReactElement; disabled?: boolean }) {
  // Open the native picker when the right-side value area is tapped. The label
  // on the left is intentionally inert — earlier we made the whole row tappable
  // and it surprised users who just wanted to glance at the field labels.
  const onValueClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.target instanceof HTMLInputElement) return; // input handles its own tap
    const input = event.currentTarget.querySelector('input');
    if (!input) return;
    const withPicker = input as HTMLInputElement & { showPicker?: () => void };
    if (typeof withPicker.showPicker === 'function') {
      try { withPicker.showPicker(); } catch { input.focus(); }
    } else {
      input.focus();
    }
  };

  return (
    <div className={`${m.timeBlockGroup}${disabled ? ` ${m.timeBlockGroupDisabled}` : ''}`}>
      <span className={m.timeBlockLabel}>{label}</span>
      <div
        className={m.timeBlockValueArea}
        onClick={onValueClick}
        role={disabled ? undefined : 'button'}
      >
        {children}
      </div>
    </div>
  );
}

/* ── iOS-style toggle switch ────────────────────────────────────────────── */

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <label className={m.toggle}>
      <input
        type="checkbox"
        className={m.toggleInput}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label="Comutator"
      />
      <span className={m.toggleTrack}>
        <span className={m.toggleThumb} />
      </span>
    </label>
  );
}
