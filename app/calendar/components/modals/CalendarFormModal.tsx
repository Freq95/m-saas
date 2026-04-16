'use client';

import { useEffect, useRef, useState } from 'react';
import styles from '../../page.module.css';
import type { CalendarListItem } from '../../hooks';
import {
  DEFAULT_COLOR_MINE,
  DEFAULT_COLOR_OTHERS,
} from '@/lib/calendar-color-policy';

type CalendarFormMode = 'create' | 'edit';

export interface CalendarFormValues {
  name: string;
  color_mine: string;
  color_others: string;
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
  const [colorMine, setColorMine] = useState(DEFAULT_COLOR_MINE);
  const [colorOthers, setColorOthers] = useState(DEFAULT_COLOR_OTHERS);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isEditMode = mode === 'edit';

  useEffect(() => {
    if (!isOpen) return;
    setName(calendar?.name || '');
    setColorMine(calendar?.color_mine || DEFAULT_COLOR_MINE);
    setColorOthers(calendar?.color_others || DEFAULT_COLOR_OTHERS);
    setError(null);
    setIsSubmitting(false);
    setIsDeleting(false);
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
      await onSubmit({ name: trimmedName, color_mine: colorMine, color_others: colorOthers });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nu am putut salva calendarul.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !calendar || calendar.is_default || isSubmitting || isDeleting) return;
    const confirmed = window.confirm(`Stergi calendarul "${calendar.name}"?`);
    if (!confirmed) return;
    setError(null);
    setIsDeleting(true);
    try {
      await onDelete();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Nu am putut sterge calendarul.');
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
        aria-label={isEditMode ? 'Editeaza calendarul' : 'Calendar nou'}
      >
        <div className={styles.modalHeader}>
          <h3>{isEditMode ? 'Setari calendar' : 'Calendar nou'}</h3>
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

          <div className={styles.modalFieldRow}>
            <div className={styles.modalField}>
              <label htmlFor="cal-color-mine">Programarile mele</label>
              <div className={styles.colorFieldRow}>
                <span
                  className={styles.colorPreview}
                  style={{ backgroundColor: colorMine }}
                  aria-hidden="true"
                />
                <input
                  id="cal-color-mine"
                  className={styles.colorInput}
                  type="color"
                  value={colorMine}
                  onChange={(e) => setColorMine(e.target.value.toUpperCase())}
                  disabled={busy}
                />
                <span className={styles.colorValue}>{colorMine.toUpperCase()}</span>
              </div>
            </div>

            <div className={styles.modalField}>
              <label htmlFor="cal-color-others">Alti dentisti</label>
              <div className={styles.colorFieldRow}>
                <span
                  className={styles.colorPreview}
                  style={{ backgroundColor: colorOthers }}
                  aria-hidden="true"
                />
                <input
                  id="cal-color-others"
                  className={styles.colorInput}
                  type="color"
                  value={colorOthers}
                  onChange={(e) => setColorOthers(e.target.value.toUpperCase())}
                  disabled={busy}
                />
                <span className={styles.colorValue}>{colorOthers.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.modalActions}>
          {isEditMode && calendar && !calendar.is_default && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
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
    </div>
  );
}
