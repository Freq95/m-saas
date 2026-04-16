import styles from '../../../../page.module.css';
import type { AppointmentService } from '../types';

interface ServiceSectionProps {
  services: AppointmentService[];
  serviceId: string;
  onSelect: (serviceId: string, durationMinutes?: number) => void;
  loading: boolean;
  error: string | null;
  disabled: boolean;
  readOnly: boolean;
  readOnlyName?: string;
}

function formatPrice(price: number): string {
  if (!Number.isFinite(price) || price <= 0) return '';
  return ` — ${price} lei`;
}

export function ServiceSection({
  services,
  serviceId,
  onSelect,
  loading,
  error,
  disabled,
  readOnly,
  readOnlyName,
}: ServiceSectionProps) {
  if (readOnly) {
    const selected = services.find((s) => String(s.id) === serviceId);
    return (
      <div className={styles.modalField}>
        <label>Serviciu</label>
        <div className={styles.previewValue}>{selected?.name || readOnlyName || '—'}</div>
      </div>
    );
  }

  return (
    <div className={styles.modalField}>
      <label htmlFor="appt-service">Serviciu *</label>
      <select
        id="appt-service"
        value={serviceId}
        onChange={(event) => {
          const next = event.target.value;
          const chosen = services.find((s) => String(s.id) === next);
          onSelect(next, chosen?.duration_minutes);
        }}
        disabled={disabled || loading || services.length === 0}
      >
        <option value="">
          {loading ? 'Se incarca serviciile...' : services.length === 0 ? '(niciun serviciu)' : 'Alege serviciul'}
        </option>
        {services.map((service) => (
          <option key={service.id} value={String(service.id)}>
            {service.name} ({service.duration_minutes} min)
            {formatPrice(service.price)}
          </option>
        ))}
      </select>
      {error && <p className={styles.fieldHint}>{error}</p>}
    </div>
  );
}
