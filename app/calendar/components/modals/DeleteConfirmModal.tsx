'use client';

import { useRef, useState } from 'react';
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
  const backdropPressStartedRef = useRef(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    backdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isDeleting) return;
    const endedOnBackdrop = event.target === event.currentTarget;
    if (backdropPressStartedRef.current && endedOnBackdrop) {
      onClose();
    }
    backdropPressStartedRef.current = false;
  };

  const handleConfirmClick = async () => {
    if (isDeleting) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await onConfirm();
    } catch {
      setDeleteError('Nu s-a putut sterge programarea. Incearca din nou.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen || !appointment) return null;

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
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
        {deleteError && <p className={styles.sheetDescription}>{deleteError}</p>}
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose} className={styles.cancelButton} disabled={isDeleting}>
            Renunta
          </button>
          <button type="button" onClick={handleConfirmClick} className={styles.deleteButton} disabled={isDeleting}>
            {isDeleting ? 'Se sterge...' : 'Sterge'}
          </button>
        </div>
      </div>
    </div>
  );
}
