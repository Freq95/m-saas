'use client';

import { useEffect, useState } from 'react';
import styles from '../../page.module.css';
import { useModal } from '@/lib/useModal';
import { useFocusRestore } from '@/lib/useFocusRestore';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirma',
  cancelLabel = 'Renunta',
  tone = 'default',
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { overlayProps, dialogProps } = useModal({
    isOpen,
    onClose,
    closeDisabled: isWorking,
  });
  useFocusRestore(isOpen);

  useEffect(() => {
    if (!isOpen) {
      setIsWorking(false);
      setError(null);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (isWorking) return;
    setError(null);
    setIsWorking(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Actiunea a esuat. Incearca din nou.');
    } finally {
      setIsWorking(false);
    }
  };

  if (!isOpen) return null;

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
        aria-label={title}
      >
        <h3>{title}</h3>
        <p className={styles.sheetDescription}>{message}</p>
        {error && <p className={styles.sheetDescription}>{error}</p>}
        <div className={styles.modalActions}>
          <button
            type="button"
            onClick={onClose}
            className={styles.cancelButton}
            disabled={isWorking}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={tone === 'danger' ? styles.deleteButton : styles.saveButton}
            disabled={isWorking}
          >
            {isWorking ? 'Se proceseaza...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
