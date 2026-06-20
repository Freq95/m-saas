'use client';

import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from '../../page.module.css';
import type { Appointment } from '../../hooks/useCalendar';
import { getStatusConfig, normalizeStatus } from '@/lib/calendar-color-policy';
import { useModal } from '@/lib/useModal';

interface AppointmentPreviewModalProps {
  isOpen: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function AppointmentPreviewModal({
  isOpen,
  appointment,
  onClose,
  onEdit,
  onDelete,
}: AppointmentPreviewModalProps) {
  const { overlayProps, dialogProps } = useModal({ isOpen, onClose });
  const currentStatus = normalizeStatus(appointment?.status);
  const statusCfg = getStatusConfig(currentStatus);

  if (!isOpen || !appointment) return null;

  // Multi-service: prefer the array shape, fall back to the legacy singular
  // `service_name`. Older appointments only carry `service_name`.
  const serviceNames: string[] =
    Array.isArray(appointment.service_names) && appointment.service_names.length > 0
      ? appointment.service_names
      : appointment.service_name
        ? [appointment.service_name]
        : [];
  const subtitleText =
    serviceNames.length === 0
      ? ''
      : serviceNames.length === 1
        ? serviceNames[0]
        : `${serviceNames.length} servicii: ${serviceNames.join(', ')}`;

  return (
    <div
      className={styles.modalOverlay}
      {...overlayProps}
    >
      <div
        className={styles.previewModal}
        {...dialogProps}
        role="dialog"
        aria-modal="true"
        aria-label="Detalii programare"
      >
        <div className={styles.previewHeader}>
          <div>
            <h2 className={styles.previewTitle}>{appointment.client_name}</h2>
            {subtitleText && <p className={styles.previewSubtitle}>{subtitleText}</p>}
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Închide" data-tooltip="Închide">
            x
          </button>
        </div>

        <div className={styles.previewContent}>
          <div className={styles.previewSection}>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Data și ora</span>
              <span className={styles.previewValue}>
                {format(new Date(appointment.start_time), "EEEE, d MMMM yyyy 'la' HH:mm", { locale: ro })} -{' '}
                {format(new Date(appointment.end_time), 'HH:mm', { locale: ro })}
              </span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Email</span>
              <span className={styles.previewValue}>{appointment.client_email || 'N/A'}</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Telefon</span>
              <span className={styles.previewValue}>{appointment.client_phone || 'N/A'}</span>
            </div>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Status</span>
              <span className={styles.previewStatusBadge}>
                <span
                  className={styles.statusDot}
                  style={{ background: statusCfg.dot }}
                  aria-hidden="true"
                />
                {statusCfg.label}
              </span>
            </div>
            {appointment.notes && (
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>Note</span>
                <span className={styles.previewValue}>{appointment.notes}</span>
              </div>
            )}
          </div>

        </div>

        <div className={styles.previewActions}>
          <button className={styles.editButton} onClick={onEdit}>
            Editează
          </button>
          <button className={styles.deleteButton} onClick={onDelete}>
            Șterge
          </button>
        </div>
      </div>
    </div>
  );
}
