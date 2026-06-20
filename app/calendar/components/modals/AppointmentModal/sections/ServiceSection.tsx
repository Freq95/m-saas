import { memo, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import styles from '../../../../page.module.css';
import type { AppointmentService } from '../types';

interface ServiceSectionProps {
  services: AppointmentService[];
  /** Currently selected service IDs (as strings), in selection order. */
  serviceIds: string[];
  /**
   * Called whenever the selection changes. Receives the new full array plus
   * the precomputed total duration so the parent reducer can recompute the
   * end-time in one go (avoids a duplicate Map lookup in the consumer).
   */
  onChange: (serviceIds: string[], totalDurationMinutes: number) => void;
  loading: boolean;
  error: string | null;
  disabled: boolean;
  readOnly: boolean;
  validationError?: string;
  /** Names from the saved appointment, shown in read-only mode if `services`
   *  hasn't yet loaded (or the selected service was deleted from the catalog). */
  readOnlyNames?: string[];
}

function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '';
  return ` — ${price} lei`;
}

function sumDuration(services: AppointmentService[]): number {
  return services.reduce(
    (sum, s) => sum + (typeof s.duration_minutes === 'number' ? s.duration_minutes : 0),
    0
  );
}

function sumPrice(services: AppointmentService[]): number {
  return services.reduce(
    (sum, s) => sum + (typeof s.price === 'number' && s.price > 0 ? s.price : 0),
    0
  );
}

/** Lower-case and strip diacritics so "consultaţie" matches "cons". */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function ServiceSectionBase({
  services,
  serviceIds,
  onChange,
  loading,
  error,
  disabled,
  readOnly,
  validationError,
  readOnlyNames,
}: ServiceSectionProps) {
  const serviceById = useMemo(
    () => new Map(services.map((s) => [String(s.id), s])),
    [services]
  );

  // Resolve selected services in user-defined order. Filter out IDs that no
  // longer exist in the catalog (service deleted while modal was open).
  const selectedServices = useMemo(
    () =>
      serviceIds
        .map((id) => serviceById.get(id))
        .filter((s): s is AppointmentService => Boolean(s)),
    [serviceIds, serviceById]
  );

  // Not-yet-selected services, sorted alphabetically (diacritic-insensitive).
  const availableServices = useMemo(() => {
    const selectedSet = new Set(serviceIds);
    return services
      .filter((s) => !selectedSet.has(String(s.id)))
      .sort((a, b) => normalize(a.name).localeCompare(normalize(b.name), 'ro'));
  }, [services, serviceIds]);

  const totalDuration = sumDuration(selectedServices);
  const totalPrice = sumPrice(selectedServices);

  // ── Read-only render ─────────────────────────────────────────────
  if (readOnly) {
    const names =
      selectedServices.length > 0
        ? selectedServices.map((s) => `${s.name} (${s.duration_minutes} min)`)
        : readOnlyNames && readOnlyNames.length > 0
          ? readOnlyNames
          : [];
    return (
      <div className={styles.modalField}>
        <label>Servicii</label>
        {names.length === 0 ? (
          <div className={styles.previewValue}>—</div>
        ) : (
          <div className={styles.serviceChips}>
            {names.map((name, idx) => (
              <span key={idx} className={`${styles.serviceChip} ${styles.serviceChipReadOnly}`}>
                {name}
              </span>
            ))}
          </div>
        )}
        {totalPrice > 0 && (
          <div className={styles.serviceTotal}>
            Total: {totalDuration} min · {totalPrice} lei
          </div>
        )}
      </div>
    );
  }

  return (
    <ServiceSectionEditable
      services={services}
      serviceIds={serviceIds}
      serviceById={serviceById}
      selectedServices={selectedServices}
      availableServices={availableServices}
      totalDuration={totalDuration}
      totalPrice={totalPrice}
      onChange={onChange}
      loading={loading}
      error={error}
      disabled={disabled}
      validationError={validationError}
    />
  );
}

interface EditableProps {
  services: AppointmentService[];
  serviceIds: string[];
  serviceById: Map<string, AppointmentService>;
  selectedServices: AppointmentService[];
  availableServices: AppointmentService[];
  totalDuration: number;
  totalPrice: number;
  onChange: (serviceIds: string[], totalDurationMinutes: number) => void;
  loading: boolean;
  error: string | null;
  disabled: boolean;
  validationError?: string;
}

function ServiceSectionEditable({
  services,
  serviceIds,
  serviceById,
  selectedServices,
  availableServices,
  totalDuration,
  totalPrice,
  onChange,
  loading,
  error,
  disabled,
  validationError,
}: EditableProps) {
  // Free-text search the user types to narrow the list.
  const [query, setQuery] = useState('');
  // Whether the suggestion list is visible (open on focus / typing).
  const [open, setOpen] = useState(false);
  // Keyboard-highlighted option index within `matches`.
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Filter the (already alphabetised) available services by the query.
  const matches = useMemo(() => {
    const q = normalize(query);
    if (!q) return availableServices;
    return availableServices.filter((s) => normalize(s.name).includes(q));
  }, [availableServices, query]);

  // Reset the highlight whenever the typed query changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Close the dropdown when clicking outside the component.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Scroll the active option into view as the user arrows through.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const handleAdd = (id: string) => {
    if (!id || serviceIds.includes(id)) return;
    const nextIds = [...serviceIds, id];
    const nextServices = nextIds
      .map((sid) => serviceById.get(sid))
      .filter((s): s is AppointmentService => Boolean(s));
    onChange(nextIds, sumDuration(nextServices));
    // Reset so the user can immediately search for another service.
    setQuery('');
    setActiveIndex(0);
  };

  const handleRemove = (id: string) => {
    const nextIds = serviceIds.filter((s) => s !== id);
    const nextServices = nextIds
      .map((sid) => serviceById.get(sid))
      .filter((s): s is AppointmentService => Boolean(s));
    onChange(nextIds, sumDuration(nextServices));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      if (open && matches[activeIndex]) {
        event.preventDefault();
        handleAdd(String(matches[activeIndex].id));
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    } else if (event.key === 'Backspace' && query === '' && selectedServices.length > 0) {
      // Quick-remove the last chip when the input is empty.
      handleRemove(String(selectedServices[selectedServices.length - 1].id));
    }
  };

  const inputDisabled = disabled || loading;
  const placeholder = loading
    ? 'Se încarcă serviciile...'
    : services.length === 0
      ? '(niciun serviciu)'
      : availableServices.length === 0
        ? 'Toate serviciile sunt adaugate'
        : selectedServices.length === 0
          ? 'Caută sau alege serviciul…'
          : '+ Adaugă serviciu';

  const listboxId = 'appt-service-listbox';

  return (
    <div className={styles.modalField}>
      <label htmlFor="appt-service-picker">Servicii <span className={styles.requiredMark}>*</span></label>

      <div ref={wrapperRef} className={styles.serviceComboWrapper}>
        <div
          className={`${styles.servicePickerSurface} ${
            inputDisabled ? styles.servicePickerSurfaceDisabled : ''
          } ${validationError ? styles.fieldControlError : ''}`}
          onClick={() => {
            if (!inputDisabled && availableServices.length > 0) setOpen(true);
          }}
        >
          {selectedServices.length > 0 && (
            <div className={styles.serviceChips}>
              {selectedServices.map((service) => (
                <span key={service.id} className={styles.serviceChip}>
                  <span className={styles.serviceChipLabel}>
                    {service.name} <span className={styles.serviceChipMeta}>· {service.duration_minutes} min</span>
                  </span>
                  <button
                    type="button"
                    className={styles.serviceChipRemove}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemove(String(service.id));
                    }}
                    disabled={disabled}
                    aria-label={`Elimina ${service.name}`}
                    data-tooltip="Elimina"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <input
            id="appt-service-picker"
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && matches[activeIndex] ? `appt-service-opt-${matches[activeIndex].id}` : undefined
            }
            autoComplete="off"
            className={styles.serviceInlinePicker}
            value={query}
            placeholder={placeholder}
            disabled={inputDisabled || availableServices.length === 0}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (availableServices.length > 0) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            aria-invalid={Boolean(validationError)}
            aria-describedby={validationError ? 'appt-service-picker-error' : undefined}
          />
        </div>

        {open && availableServices.length > 0 && (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            className={styles.serviceComboMenu}
          >
            {matches.length === 0 ? (
              <li className={styles.serviceComboEmpty}>Niciun serviciu găsit</li>
            ) : (
              matches.map((service, idx) => (
                <li
                  key={service.id}
                  id={`appt-service-opt-${service.id}`}
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={`${styles.serviceComboOption} ${
                    idx === activeIndex ? styles.serviceComboOptionActive : ''
                  }`}
                  // onMouseDown (not onClick) so it fires before the input blurs.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleAdd(String(service.id));
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  <span className={styles.serviceComboOptionName}>{service.name}</span>
                  <span className={styles.serviceComboOptionMeta}>
                    {service.duration_minutes} min{formatPrice(service.price)}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {validationError && (
        <p id="appt-service-picker-error" className={styles.fieldErrorText} role="alert">
          {validationError}
        </p>
      )}

      {selectedServices.length > 0 && (
        <div className={styles.serviceTotal}>
          Total: {totalDuration} min{totalPrice > 0 ? ` · ${totalPrice} lei` : ''}
        </div>
      )}

      {!loading && services.length === 0 && (
        <p className={styles.fieldHint}>
          Nu ai servicii definite.{' '}
          <Link href="/settings/services" className={styles.fieldHintLink}>
            Adaugă primul serviciu →
          </Link>
        </p>
      )}
      {error && <p className={styles.fieldHint}>{error}</p>}
    </div>
  );
}

export const ServiceSection = memo(ServiceSectionBase);
