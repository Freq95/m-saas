'use client';

import { useEffect, useState } from 'react';
import styles from '../../page.module.css';
import type { CalendarListItem } from '../../hooks';
import { ConfirmModal } from './ConfirmModal';
import { useModal } from '@/lib/useModal';
import Spinner from '@/components/Spinner';

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
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isEditMode = mode === 'edit';
  const busy = isSubmitting || isDeleting;
  const { overlayProps, dialogProps } = useModal({
    isOpen,
    onClose,
    closeDisabled: busy,
  });

  useEffect(() => {
    if (!isOpen) return;
    setName(calendar?.name || '');
    setError(null);
    setIsSubmitting(false);
    setIsDeleting(false);
    setShowDeleteConfirm(false);
  }, [calendar, isOpen]);

  const requestClose = () => {
    if (isSubmitting || isDeleting) return;
    onClose();
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

  const saveLabel = isEditMode ? 'Salveaza' : 'Creeaza';

  return (
    <div
      className={styles.modalOverlay}
      {...overlayProps}
    >
      <div
        className={`${styles.modal} ${styles.createSheet}`}
        {...dialogProps}
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
            data-tooltip="Inchide"
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
              {isDeleting ? (
                <>
                  <Spinner size={14} thickness={2} centered={false} label="Se sterge" />
                  <span>Se sterge</span>
                </>
              ) : 'Sterge'}
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
            {isSubmitting ? (
              <>
                <Spinner size={14} thickness={2} centered={false} label="Se salveaza" />
                <span>Se salveaza</span>
              </>
            ) : saveLabel}
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
