import { memo, useMemo, useState } from 'react';
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

function ServiceSectionBase({
  services,
  serviceIds,
  onChange,
  loading,
  error,
  disabled,
  readOnly,
  readOnlyNames,
}: ServiceSectionProps) {
  // Pick-from-dropdown anchor. Empty string = "no service is being picked
  // right now"; the select shows the placeholder option. Selecting any
  // service immediately commits it and resets back to the placeholder so
  // the user can add another.
  const [pendingPick, setPendingPick] = useState<string>('');

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

  const availableServices = useMemo(() => {
    const selectedSet = new Set(serviceIds);
    return services.filter((s) => !selectedSet.has(String(s.id)));
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

  const handleAdd = (id: string) => {
    if (!id) return;
    if (serviceIds.includes(id)) {
      // Defensive — shouldn't happen because the option is filtered out.
      setPendingPick('');
      return;
    }
    const nextIds = [...serviceIds, id];
    const nextServices = nextIds
      .map((sid) => serviceById.get(sid))
      .filter((s): s is AppointmentService => Boolean(s));
    onChange(nextIds, sumDuration(nextServices));
    // Reset the dropdown so the user can pick another service immediately.
    setPendingPick('');
  };

  const handleRemove = (id: string) => {
    const nextIds = serviceIds.filter((s) => s !== id);
    const nextServices = nextIds
      .map((sid) => serviceById.get(sid))
      .filter((s): s is AppointmentService => Boolean(s));
    onChange(nextIds, sumDuration(nextServices));
  };

  // ── Editable render ──────────────────────────────────────────────
  return (
    <div className={styles.modalField}>
      <label htmlFor="appt-service-picker">Servicii *</label>

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
                onClick={() => handleRemove(String(service.id))}
                disabled={disabled}
                aria-label={`Elimina ${service.name}`}
                title="Elimina"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <select
        id="appt-service-picker"
        value={pendingPick}
        onChange={(event) => handleAdd(event.target.value)}
        disabled={disabled || loading || availableServices.length === 0}
        className={styles.serviceAddPicker}
      >
        <option value="">
          {loading
            ? 'Se incarca serviciile...'
            : services.length === 0
              ? '(niciun serviciu)'
              : availableServices.length === 0
                ? 'Toate serviciile sunt adaugate'
                : selectedServices.length === 0
                  ? 'Alege serviciul'
                  : '+ Adauga serviciu'}
        </option>
        {availableServices.map((service) => (
          <option key={service.id} value={String(service.id)}>
            {service.name} ({service.duration_minutes} min){formatPrice(service.price)}
          </option>
        ))}
      </select>

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
