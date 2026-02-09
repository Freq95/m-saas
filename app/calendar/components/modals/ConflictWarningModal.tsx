'use client';

import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
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
  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Avertizare conflict"
      >
        <h3>⚠️ Conflict detectat</h3>

        <div className={styles.modalContent}>
          <div className={styles.conflictSection}>
            <h4 className={styles.sectionTitle}>Conflicte:</h4>
            <ul className={styles.conflictList}>
              {conflicts.map((conflict, index) => (
                <li key={index} className={styles.conflictItem}>
                  <span className={styles.conflictType}>{conflict.type}:</span>
                  <span className={styles.conflictMessage}>{conflict.message}</span>
                </li>
              ))}
            </ul>
          </div>

          {suggestions.length > 0 && (
            <div className={styles.suggestionsSection}>
              <h4 className={styles.sectionTitle}>Intervale alternative disponibile:</h4>
              <div className={styles.suggestionsList}>
                {suggestions.map((suggestion, index) => {
                  const start = new Date(suggestion.startTime);
                  const end = new Date(suggestion.endTime);

                  return (
                    <button
                      key={index}
                      className={styles.suggestionButton}
                      onClick={() => {
                        if (onSelectSlot) {
                          onSelectSlot(suggestion.startTime, suggestion.endTime);
                        }
                        onClose();
                      }}
                    >
                      <div className={styles.suggestionTime}>
                        {format(start, "EEEE, d MMM 'la' HH:mm", { locale: ro })} -{' '}
                        {format(end, 'HH:mm', { locale: ro })}
                      </div>
                      <div className={styles.suggestionReason}>{suggestion.reason}</div>
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
