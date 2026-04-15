'use client';

import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { useRef } from 'react';
import styles from '../../page.module.css';
import type { Appointment } from '../../hooks/useCalendar';
import { getStatusConfig, normalizeStatus } from '@/lib/calendar-color-policy';

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
  const backdropPressStartedRef = useRef(false);
  const currentStatus = normalizeStatus(appointment?.status);
  const statusCfg = getStatusConfig(currentStatus);

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

  if (!isOpen || !appointment) return null;

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        className={styles.previewModal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Detalii programare"
      >
        <div className={styles.previewHeader}>
          <div>
            <h2 className={styles.previewTitle}>{appointment.client_name}</h2>
            <p className={styles.previewSubtitle}>{appointment.service_name}</p>
          </div>
          <button className={styles.closeButton} onClick={onClose}>
            x
          </button>
        </div>

        <div className={styles.previewContent}>
          <div className={styles.previewSection}>
            <div className={styles.previewRow}>
              <span className={styles.previewLabel}>Data si ora</span>
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
            Editeaza
          </button>
          <button className={styles.deleteButton} onClick={onDelete}>
            Sterge
          </button>
        </div>
      </div>
    </div>
  );
}
