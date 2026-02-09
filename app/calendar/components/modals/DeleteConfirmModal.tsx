'use client';

import styles from '../../page.module.css';
import type { Appointment } from '../../hooks/useCalendar';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function DeleteConfirmModal({
  isOpen,
  appointment,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  if (!isOpen || !appointment) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.deleteSheet}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Confirmare stergere"
      >
        <h3>Stergere programare</h3>
        <p className={styles.sheetDescription}>
          Sigur vrei sa stergi programarea pentru <strong>{appointment.client_name}</strong>?
        </p>
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose} className={styles.cancelButton}>
            Renunta
          </button>
          <button type="button" onClick={onConfirm} className={styles.deleteButton}>
            Sterge
          </button>
        </div>
      </div>
    </div>
  );
}
