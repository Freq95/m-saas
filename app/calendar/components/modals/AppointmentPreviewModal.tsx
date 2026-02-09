'use client';

import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from '../../page.module.css';
import type { Appointment } from '../../hooks/useCalendar';

interface AppointmentPreviewModalProps {
  isOpen: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuickStatusChange?: (status: string) => void;
}

export function AppointmentPreviewModal({
  isOpen,
  appointment,
  onClose,
  onEdit,
  onDelete,
  onQuickStatusChange,
}: AppointmentPreviewModalProps) {
  if (!isOpen || !appointment) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
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
              <span className={`${styles.statusBadge} ${styles[appointment.status]}`}>
                {appointment.status}
              </span>
            </div>
            {appointment.notes && (
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>Note</span>
                <span className={styles.previewValue}>{appointment.notes}</span>
              </div>
            )}
          </div>

          {onQuickStatusChange && appointment.status !== 'completed' && (
            <div className={styles.quickActionsSection}>
              <p className={styles.quickActionsLabel}>Actiuni rapide:</p>
              <div className={styles.quickActionButtons}>
                {appointment.status !== 'completed' && (
                  <button
                    className={`${styles.quickActionButton} ${styles.quickActionCompleted}`}
                    onClick={() => {
                      onQuickStatusChange('completed');
                      onClose();
                    }}
                  >
                    ✓ Completeaza
                  </button>
                )}
                {appointment.status !== 'cancelled' && (
                  <button
                    className={`${styles.quickActionButton} ${styles.quickActionCancelled}`}
                    onClick={() => {
                      onQuickStatusChange('cancelled');
                      onClose();
                    }}
                  >
                    ✕ Anuleaza
                  </button>
                )}
                {appointment.status !== 'no-show' && (
                  <button
                    className={`${styles.quickActionButton} ${styles.quickActionNoShow}`}
                    onClick={() => {
                      onQuickStatusChange('no-show');
                      onClose();
                    }}
                  >
                    ⚠ Absent
                  </button>
                )}
              </div>
            </div>
          )}
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
