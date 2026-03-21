'use client';

import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import { useRef } from 'react';
import styles from '../../page.module.css';

interface Conflict {
  type: string;
  message: string;
}

interface Suggestion {
  startTime: string;
  endTime: string;
  reason: string;
}

interface ConflictWarningModalProps {
  isOpen: boolean;
  conflicts: Conflict[];
  suggestions: Suggestion[];
  onClose: () => void;
  onSelectSlot?: (startTime: string, endTime: string) => void;
}

export function ConflictWarningModal({
  isOpen,
  conflicts,
  suggestions,
  onClose,
  onSelectSlot,
}: ConflictWarningModalProps) {
  const backdropPressStartedRef = useRef(false);

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    backdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const endedOnBackdrop = event.target === event.currentTarget;
    if (backdropPressStartedRef.current && endedOnBackdrop) {
      onClose();
    }
    backdropPressStartedRef.current = false;
  };

  if (!isOpen) return null;

  return (
    <div
      className={styles.modalOverlay}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Avertizare conflict"
      >
        <h3>Interval ocupat</h3>

        <div className={styles.modalContent}>
          <div className={styles.conflictSection}>
            <h4 className={styles.sectionTitle}>Conflicte:</h4>
            {conflicts.map((conflict, i) => {
              const appt = (conflict as Conflict & { appointment?: { start_time: string; end_time: string } }).appointment;
              const timeRange = appt
                ? `${format(new Date(appt.start_time), 'HH:mm')}  ${format(new Date(appt.end_time), 'HH:mm')}`
                : null;

              const message = (() => {
                switch (conflict.type) {
                  case 'provider_appointment':
                    return `Medicul are deja o programare în acest interval${timeRange ? ` (${timeRange})` : ''}.`;
                  case 'appointment_overlap':
                    return `Exista deja o programare în acest interval${timeRange ? ` (${timeRange})` : ''}.`;
                  case 'blocked_time':
                    return 'Acest interval este marcat ca blocat.';
                  case 'outside_working_hours':
                    return 'Intervalul selectat este în afara programului de lucru.';
                  default:
                    return 'Intervalul selectat nu este disponibil.';
                }
              })();

              return <p key={i} className={styles.conflictMessage}>{message}</p>;
            })}
          </div>

          {suggestions.length > 0 && (
            <div className={styles.suggestionsSection}>
              <h4 className={styles.sectionTitle}>Alege un interval liber:</h4>
              <div className={styles.suggestionsList}>
                {suggestions.map((suggestion, i) => {
                  const start = new Date(suggestion.startTime);
                  const end = new Date(suggestion.endTime);
                  const dateLabel = format(start, 'EEEE, d MMM', { locale: ro });
                  const timeLabel = `${format(start, 'HH:mm')}  ${format(end, 'HH:mm')}`;
                  return (
                    <button
                      key={i}
                      className={styles.suggestionButton}
                      onClick={() => {
                        onSelectSlot?.(suggestion.startTime, suggestion.endTime);
                        onClose();
                      }}
                    >
                      <span className={styles.suggestionDate}>{dateLabel}</span>
                      <span className={styles.suggestionTime}>{timeLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {suggestions.length === 0 && (
            <p className={styles.noSuggestions}>
              Nu am gasit intervale alternative disponibile. Te rugam sa alegi alt moment.
            </p>
          )}
        </div>

        <div className={styles.modalActions}>
          <button onClick={onClose} className={styles.cancelButton}>
            Inchide
          </button>
        </div>
      </div>
    </div>
  );
}
