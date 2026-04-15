'use client';

import { type CSSProperties, useEffect, useRef, useState } from 'react';
import styles from '../../page.module.css';
import type { CalendarListItem } from '../../hooks';
import {
  DENTIST_COLOR_PALETTE,
  isDentistPaletteColor,
  normalizeDentistColor,
  requiresDentistPaletteNormalization,
} from '@/lib/calendar-color-policy';

type CalendarFormMode = 'create' | 'edit';

export interface CalendarFormValues {
  name: string;
  color: string;
  colorMode?: 'category' | 'dentist';
}

interface CalendarFormModalProps {
  isOpen: boolean;
  mode: CalendarFormMode;
  calendar?: CalendarListItem | null;
  onClose: () => void;
  onSubmit: (values: CalendarFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const DEFAULT_COLOR = '#2563eb';

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
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [colorMode, setColorMode] = useState<'category' | 'dentist'>('category');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isEditMode = mode === 'edit';
  const usesDentistPalette = isEditMode && colorMode === 'dentist';
  const ownerNeedsPaletteNormalization = requiresDentistPaletteNormalization(
    usesDentistPalette ? 'dentist' : undefined,
    color
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setName(calendar?.name || '');
    setColor(calendar?.color || DEFAULT_COLOR);
    setColorMode(calendar?.settings?.color_mode || 'category');
    setError(null);
    setIsSubmitting(false);
    setIsDeleting(false);
  }, [calendar, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting && !isDeleting) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isDeleting, isOpen, isSubmitting, onClose]);

  const requestClose = () => {
    if (isSubmitting || isDeleting) {
      return;
    }
    onClose();
  };

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    backdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const endedOnBackdrop = event.target === event.currentTarget;
    if (backdropPressStartedRef.current && endedOnBackdrop) {
      requestClose();
    }
    backdropPressStartedRef.current = false;
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Completeaza numele calendarului.');
      return;
    }

    if (usesDentistPalette && !isDentistPaletteColor(color)) {
      setError('In modul Dentisti, alege o culoare din paleta presetata.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        color,
        colorMode: isEditMode ? colorMode : undefined,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nu am putut salva calendarul.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !calendar || calendar.is_default || isSubmitting || isDeleting) {
      return;
    }

    const confirmed = window.confirm(`Stergi calendarul "${calendar.name}"?`);
    if (!confirmed) {
      return;
    }

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

  if (!isOpen) {
    return null;
  }

  const saveLabel = isSubmitting
    ? 'Se salveaza...'
    : isEditMode
      ? 'Salveaza modificarile'
      : 'Creeaza calendarul';

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        className={`${styles.modal} ${styles.createSheet}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEditMode ? 'Editeaza calendarul' : 'Creeaza calendar'}
      >
        <div className={styles.modalHeader}>
          <div>
            <h3>{isEditMode ? 'Setari calendar' : 'Calendar nou'}</h3>
            <p className={styles.modalSubcopy}>
              {isEditMode
                ? 'Actualizezi culoarea, numele si modul de afisare pentru calendar.'
                : 'Creezi un calendar nou pentru programul tau.'}
            </p>
          </div>

          <button type="button" className={styles.modalIconButton} onClick={requestClose} aria-label="Inchide">
            x
          </button>
        </div>

        <div className={styles.modalContent}>
          {error && <div className={`${styles.feedbackBanner} ${styles.feedbackBannerError}`}>{error}</div>}

          <div className={styles.modalField}>
            <label htmlFor="calendar-name">Nume calendar *</label>
            <input
              id="calendar-name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Cabinet 1"
              disabled={isSubmitting || isDeleting}
            />
          </div>

          <div className={styles.modalField}>
            <label htmlFor="calendar-color">Culoare</label>
            {usesDentistPalette ? (
              <div className={styles.paletteGrid} role="listbox" aria-label="Paleta owner dentist">
                {DENTIST_COLOR_PALETTE.map((paletteColor) => {
                  const isSelected = paletteColor === normalizeDentistColor(color);
                  return (
                    <button
                      key={paletteColor}
                      type="button"
                      className={`${styles.paletteColorButton}${isSelected ? ` ${styles.paletteColorButtonActive}` : ''}`}
                      style={{ '--palette-color': paletteColor } as CSSProperties}
                      onClick={() => setColor(paletteColor)}
                      disabled={isSubmitting || isDeleting}
                      aria-pressed={isSelected}
                    >
                      <span className={styles.paletteColorSwatch} aria-hidden="true" />
                      <span>{paletteColor}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.colorFieldRow}>
                <span className={styles.colorPreview} style={{ backgroundColor: color }} aria-hidden="true" />
                <input
                  id="calendar-color"
                  className={styles.colorInput}
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  disabled={isSubmitting || isDeleting}
                />
                <span className={styles.colorValue}>{color.toUpperCase()}</span>
              </div>
            )}
            <p className={styles.fieldHint}>
              Pentru calendarele non-implicite, aceasta culoare se foloseste direct pe programari. In modul "Dentisti", ownerul si dentistii partajati folosesc culori unice.
            </p>
            {ownerNeedsPaletteNormalization && (
              <div className={styles.clientSuggestionError}>
                Acest calendar foloseste o culoare veche. Alege una din paleta presetata pentru modul Dentisti.
              </div>
            )}
          </div>

          {isEditMode && (
            <div className={styles.modalField}>
              <label htmlFor="calendar-color-mode">Mod de colorare</label>
              <select
                id="calendar-color-mode"
                value={colorMode}
                onChange={(event) => setColorMode(event.target.value as 'category' | 'dentist')}
                disabled={isSubmitting || isDeleting}
              >
                <option value="category">Categorii</option>
                <option value="dentist">Dentisti</option>
              </select>
              <p className={styles.fieldHint}>
                Pentru calendarul implicit, "Categorii" pastreaza culorile pe categorii. Pentru calendarele non-implicite, programarile folosesc culoarea calendarului. "Dentisti" coloreaza dupa dentistul asignat, iar ownerul foloseste culoarea calendarului.
              </p>
            </div>
          )}
        </div>

        <div className={styles.modalActions}>
          {isEditMode && calendar && !calendar.is_default && onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className={styles.deleteButton}
              disabled={isSubmitting || isDeleting}
            >
              {isDeleting ? 'Se sterge...' : 'Sterge calendarul'}
            </button>
          )}
          <button type="button" onClick={requestClose} className={styles.cancelButton} disabled={isSubmitting || isDeleting}>
            Renunta
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className={styles.saveButton}
            disabled={isSubmitting || isDeleting}
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
