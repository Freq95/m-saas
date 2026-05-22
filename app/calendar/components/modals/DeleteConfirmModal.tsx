'use client';

import { useEffect, useState } from 'react';
import styles from '../../page.module.css';
import type { Appointment } from '../../hooks/useCalendar';
import { useModal } from '@/lib/useModal';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  appointment: Appointment | null;
  onClose: () => void;
  // Receives an optional scope so recurring deletes can target the whole series.
  // For non-recurring appointments the scope is always undefined.
  onConfirm: (scope?: 'series') => Promise<void>;
}

export function DeleteConfirmModal({
  isOpen,
  appointment,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const isRecurring = Boolean(appointment?.recurrence_group_id);
  const [scope, setScope] = useState<'single' | 'series'>('single');
  const { overlayProps, dialogProps } = useModal({
    isOpen,
    onClose,
    closeDisabled: isDeleting,
  });

  // Reset choice each time the modal opens — otherwise a previous "series"
  // pick would silently carry over to a different appointment.
  useEffect(() => {
    if (isOpen) setScope('single');
  }, [isOpen]);

  const handleConfirmClick = async () => {
    if (isDeleting) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await onConfirm(isRecurring && scope === 'series' ? 'series' : undefined);
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
      {...overlayProps}
    >
      <div
        className={styles.deleteSheet}
        {...dialogProps}
        role="dialog"
        aria-modal="true"
        aria-label="Confirmare stergere"
      >
        <h3>Stergere programare</h3>
        <p className={styles.sheetDescription}>
          Sigur vrei sa stergi programarea pentru <strong>{appointment.client_name}</strong>?
        </p>

        {isRecurring && (
          <div
            role="radiogroup"
            aria-label="Ce vrei sa stergi"
            style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.5rem 0 0.25rem' }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="delete-scope"
                value="single"
                checked={scope === 'single'}
                onChange={() => setScope('single')}
                disabled={isDeleting}
              />
              <span>Doar aceasta aparitie</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="delete-scope"
                value="series"
                checked={scope === 'series'}
                onChange={() => setScope('series')}
                disabled={isDeleting}
              />
              <span>Toata seria recurenta</span>
            </label>
          </div>
        )}

        {deleteError && <p className={styles.sheetDescription}>{deleteError}</p>}
        <div className={styles.modalActions}>
          <button type="button" onClick={onClose} className={styles.cancelButton} disabled={isDeleting}>
            Renunta
          </button>
          <button type="button" onClick={handleConfirmClick} className={styles.deleteButton} disabled={isDeleting}>
            {isDeleting
              ? 'Se sterge...'
              : isRecurring && scope === 'series'
                ? 'Sterge seria'
                : 'Sterge'}
          </button>
        </div>
      </div>
    </div>
  );
}
