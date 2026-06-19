'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from '../../page.module.css';
import { useModal } from '@/lib/useModal';
import { useFocusRestore } from '@/lib/useFocusRestore';
import Spinner from '@/components/Spinner';

interface RecurrenceScopeModalProps {
  isOpen: boolean;
  /** Patient name shown in the body copy so the user knows which appointment they're editing. */
  clientName?: string;
  /** Fired when the user picks a scope and confirms. */
  onConfirm: (scope: 'this' | 'series') => void;
  /** Fired when the user cancels (Esc, backdrop, or "Renunta"). */
  onClose: () => void;
  /** Pre-disable interaction while the parent's save flow is in flight. */
  isSubmitting?: boolean;
}

/**
 * Asks the user whether their edits apply to just this occurrence of a
 * recurring appointment or to the entire series. Mirrors the UX of
 * DeleteConfirmModal's radio-group, intentionally limited to two options
 * (the user explicitly didn't want a third "this + future" choice).
 *
 * The parent (AppointmentModal) opens this modal in place of the normal
 * save action when the appointment being edited has a recurrence_group_id.
 * The parent then re-submits with the chosen `scope` flag set on the
 * outbound payload, which CalendarPageClient forwards to PATCH
 * /api/appointments/[id].
 */
export function RecurrenceScopeModal({
  isOpen,
  clientName,
  onConfirm,
  onClose,
  isSubmitting = false,
}: RecurrenceScopeModalProps) {
  const [scope, setScope] = useState<'this' | 'series'>('this');
  const { overlayProps, dialogProps } = useModal({
    isOpen,
    onClose,
    closeDisabled: isSubmitting,
  });

  // Reset to the safer default each time the modal opens. Otherwise a prior
  // "series" pick would silently carry over to the next edit and could wipe
  // out unrelated occurrences.
  useEffect(() => {
    if (isOpen) setScope('this');
  }, [isOpen]);

  useFocusRestore(isOpen);

  if (!isOpen) return null;
  // Bail out during SSR where document doesn't exist.
  if (typeof document === 'undefined') return null;

  const handleConfirm = () => {
    if (isSubmitting) return;
    onConfirm(scope);
  };

  // Render into document.body so the modal escapes the stacking context of
  // whatever opened it. The mobile flow opens it from inside a vaul drawer
  // which fights us in two ways: (1) vaul sets the parent edit sheet to
  // z-index 1001, above the standard modal overlay's 1000; (2) vaul writes
  // `pointer-events: none` onto <body> inline to lock background interaction
  // while the drawer is open, and pointer-events DOES inherit, so descendants
  // (including this portaled modal) become non-clickable unless they
  // explicitly opt back in. We pin both: a higher z-index than vaul's drawer
  // and an explicit pointer-events: auto on the overlay and dialog.
  return createPortal(
    <div
      className={styles.modalOverlay}
      style={{ zIndex: 1100, pointerEvents: 'auto' }}
      {...overlayProps}
    >
      <div
        className={styles.deleteSheet}
        style={{ pointerEvents: 'auto' }}
        {...dialogProps}
        role="dialog"
        aria-modal="true"
        aria-label="Aplica modificarile"
      >
        <h3>Salveaza modificarile</h3>
        <p className={styles.sheetDescription}>
          {clientName ? (
            <>
              Programarea pentru <strong>{clientName}</strong> face parte dintr-o serie recurenta.
              Aplica modificarile la:
            </>
          ) : (
            'Aceasta programare face parte dintr-o serie recurenta. Aplica modificarile la:'
          )}
        </p>

        <div
          role="radiogroup"
          aria-label="Scopul modificarii"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', margin: '0.5rem 0 0.25rem' }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="recurrence-scope"
              value="this"
              checked={scope === 'this'}
              onChange={() => setScope('this')}
              disabled={isSubmitting}
            />
            <span>Doar aceasta aparitie</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="radio"
              name="recurrence-scope"
              value="series"
              checked={scope === 'series'}
              onChange={() => setScope('series')}
              disabled={isSubmitting}
            />
            <span>Intreaga serie</span>
          </label>
        </div>

        <div className={styles.modalActions}>
          <button type="button" onClick={onClose} className={styles.cancelButton} disabled={isSubmitting}>
            Renunta
          </button>
          <button type="button" onClick={handleConfirm} className={styles.editButton} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Spinner size={14} thickness={2} centered={false} label="Se salveaza" />
                <span>Se salveaza</span>
              </>
            ) : scope === 'series' ? 'Salveaza seria' : 'Salveaza'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
