'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '../../page.module.css';

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
  const backdropPressStartedRef = useRef(false);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsWorking(false);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isWorking) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, isWorking, onClose]);

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    backdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isWorking) return;
    const endedOnBackdrop = event.target === event.currentTarget;
    if (backdropPressStartedRef.current && endedOnBackdrop) onClose();
    backdropPressStartedRef.current = false;
  };

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
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        className={styles.deleteSheet}
        onClick={(e) => e.stopPropagation()}
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
