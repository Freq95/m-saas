'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '../../page.module.css';
import type { CalendarListItem } from '../../hooks';
import { ConfirmModal } from './ConfirmModal';

type CalendarFormMode = 'create' | 'edit';

export interface CalendarFormValues {
  name: string;
}

interface CalendarFormModalProps {
  isOpen: boolean;
  mode: CalendarFormMode;
  calendar?: CalendarListItem | null;
  onClose: () => void;
  onSubmit: (values: CalendarFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export function CalendarFormModal({
  isOpen,
  mode,
  calendar = null,
  onClose,
  onSubmit,
  onDelete,
}: CalendarFormModalProps) {
  const backdropPressStartedRef = useRef(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isEditMode = mode === 'edit';

  useEffect(() => {
    if (!isOpen) return;
    setName(calendar?.name || '');
    setError(null);
    setIsSubmitting(false);
    setIsDeleting(false);
    setShowDeleteConfirm(false);
  }, [calendar, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting && !isDeleting) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isDeleting, isOpen, isSubmitting, onClose]);

  const requestClose = () => {
    if (isSubmitting || isDeleting) return;
    onClose();
  };

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    backdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const endedOnBackdrop = event.target === event.currentTarget;
    if (backdropPressStartedRef.current && endedOnBackdrop) requestClose();
    backdropPressStartedRef.current = false;
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Completeaza numele calendarului.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({ name: trimmedName });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nu am putut salva calendarul.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = () => {
    if (!onDelete || !calendar || calendar.is_default || isSubmitting || isDeleting) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!onDelete || !calendar) return;
    setIsDeleting(true);
    try {
      await onDelete();
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  const busy = isSubmitting || isDeleting;
  const saveLabel = isSubmitting ? 'Se salveaza...' : isEditMode ? 'Salveaza' : 'Creeaza';

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        className={`${styles.modal} ${styles.createSheet}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEditMode ? 'Redenumeste calendarul' : 'Calendar nou'}
      >
        <div className={styles.modalHeader}>
          <h3>{isEditMode ? 'Redenumeste calendarul' : 'Calendar nou'}</h3>
          <button
            type="button"
            className={styles.modalIconButton}
            onClick={requestClose}
            aria-label="Inchide"
            disabled={busy}
          >
            <IconX />
          </button>
        </div>

        <div className={styles.modalContent}>
          {error && (
            <div className={`${styles.feedbackBanner} ${styles.feedbackBannerError}`}>
              {error}
            </div>
          )}

          <div className={styles.modalField}>
            <label htmlFor="cal-name">Nume</label>
            <input
              id="cal-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Cabinet 1"
              disabled={busy}
              maxLength={100}
            />
          </div>
        </div>

        <div className={styles.modalActions}>
          {isEditMode && calendar && !calendar.is_default && onDelete && (
            <button
              type="button"
              onClick={handleDeleteClick}
              className={styles.deleteButton}
              disabled={busy}
            >
              {isDeleting ? 'Se sterge...' : 'Sterge'}
            </button>
          )}
          <button
            type="button"
            onClick={requestClose}
            className={styles.cancelButton}
            disabled={busy}
          >
            Renunta
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className={styles.saveButton}
            disabled={busy}
          >
            {saveLabel}
          </button>
        </div>
      </div>
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Stergere calendar"
        message={calendar ? `Stergi calendarul "${calendar.name}"?` : ''}
        confirmLabel="Sterge"
        tone="danger"
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
