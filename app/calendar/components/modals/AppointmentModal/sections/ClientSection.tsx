import { useEffect, useId, useRef, useState } from 'react';
import styles from '../../../../page.module.css';
import { useClientSuggestions } from '../useClientSuggestions';
import type { ClientSuggestion } from '../types';

interface ClientSectionProps {
  isOpen: boolean;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  notes: string;
  selectedClientId: number | null;
  onNameChange: (value: string) => void;
  onFieldChange: (field: 'clientEmail' | 'clientPhone' | 'notes', value: string) => void;
  onApplySuggestion: (suggestion: ClientSuggestion) => void;
  onClearLink: () => void;
  onDropdownOpenChange?: (isOpen: boolean) => void;
  disabled: boolean;
  readOnly: boolean;
  /** Calendar context — used for permission validation in the API call. */
  calendarId?: number | null;
  /** Scopes patient suggestions to this specific dentist's client list. */
  dentistUserId?: number | null;
  /** When true, the current user is creating an appointment for themselves and can create new patients. */
  isOwnDentist?: boolean;
}

export function ClientSection({
  isOpen,
  clientName,
  clientEmail,
  clientPhone,
  notes,
  selectedClientId,
  onNameChange,
  onFieldChange,
  onApplySuggestion,
  onClearLink,
  onDropdownOpenChange,
  disabled,
  readOnly,
  calendarId,
  dentistUserId,
  isOwnDentist = true,
}: ClientSectionProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const {
    suggestions,
    loading,
    error,
    resolvedQuery,
    hasExactNameMatch,
  } = useClientSuggestions({
    isOpen: isOpen && !readOnly && isFocused,
    query: clientName,
    calendarId,
    dentistUserId,
  });

  useEffect(() => {
    if (!isFocused) return;
    const onDocClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused || suggestions.length === 0) {
      setActiveIndex(-1);
      return;
    }

    setActiveIndex((prev) => (prev >= suggestions.length ? suggestions.length - 1 : prev));
  }, [isFocused, suggestions]);

  const trimmed = clientName.trim();
  const hasLinked = selectedClientId !== null;
  const showDropdown =
    !readOnly && isFocused && !hasLinked && (suggestions.length > 0 || loading);
  const activeSuggestion =
    activeIndex >= 0 && activeIndex < suggestions.length ? suggestions[activeIndex] : null;
  const showNewClientBadge =
    !readOnly &&
    !hasLinked &&
    trimmed.length >= 2 &&
    resolvedQuery === trimmed &&
    !hasExactNameMatch &&
    !loading &&
    !error;

  useEffect(() => {
    onDropdownOpenChange?.(showDropdown);
  }, [onDropdownOpenChange, showDropdown]);

  useEffect(() => {
    return () => {
      onDropdownOpenChange?.(false);
    };
  }, [onDropdownOpenChange]);

  if (readOnly) {
    return (
      <>
        <div className={styles.modalField}>
          <label>Client</label>
          <div className={styles.previewValue}>{clientName || '—'}</div>
        </div>
        {(clientEmail || clientPhone) && (
          <div className={styles.modalFieldRow}>
            {clientEmail && (
              <div className={styles.modalField}>
                <label>Email</label>
                <div className={styles.previewValue}>{clientEmail}</div>
              </div>
            )}
            {clientPhone && (
              <div className={styles.modalField}>
                <label>Telefon</label>
                <div className={styles.previewValue}>{clientPhone}</div>
              </div>
            )}
          </div>
        )}
        {notes && (
          <div className={styles.modalField}>
            <label>Note</label>
            <div className={styles.previewValue}>{notes}</div>
          </div>
        )}
      </>
    );
  }

  const applySuggestion = (suggestion: ClientSuggestion) => {
    onApplySuggestion(suggestion);
    setActiveIndex(-1);
    setIsFocused(false);
  };

  const handleAutocompleteKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && suggestions.length > 0 && showDropdown) {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex((prev) => (prev + 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === 'ArrowUp' && suggestions.length > 0 && showDropdown) {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }

    if (event.key === 'Enter' && activeSuggestion && showDropdown) {
      event.preventDefault();
      event.stopPropagation();
      applySuggestion(activeSuggestion);
      return;
    }

    if (event.key === 'Escape' && showDropdown) {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(-1);
      setIsFocused(false);
    }
  };

  return (
    <>
      <div className={styles.modalField}>
        <label htmlFor="appt-client-name">Nume client *</label>
        <div className={styles.clientAutocomplete} ref={wrapperRef}>
          <input
            ref={inputRef}
            id="appt-client-name"
            type="text"
            value={clientName}
            onChange={(event) => onNameChange(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleAutocompleteKeyDown}
            placeholder="Ion Popescu"
            disabled={disabled}
            maxLength={255}
            autoComplete="off"
            role="combobox"
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-activedescendant={
              activeSuggestion ? `${listboxId}-option-${activeSuggestion.id}` : undefined
            }
          />
          {showDropdown && (
            <div
              id={listboxId}
              className={styles.clientSuggestionsDropdown}
              role="listbox"
            >
              {loading && suggestions.length === 0 ? (
                <div className={styles.clientSuggestionEmpty}>Se cauta...</div>
              ) : (
                suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    id={`${listboxId}-option-${suggestion.id}`}
                    type="button"
                    className={`${styles.clientSuggestionItem} ${index === activeIndex ? styles.clientSuggestionItemActive : ''}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => applySuggestion(suggestion)}
                  >
                    <span className={styles.clientSuggestionName}>{suggestion.name}</span>
                    {(suggestion.email || suggestion.phone) && (
                      <span className={styles.clientSuggestionMeta}>
                        {[suggestion.phone, suggestion.email].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {error && (
          <p className={styles.fieldHint} role="alert">
            {error}
          </p>
        )}
        {hasLinked && (
          <div
            className={`${styles.clientStatusBadge} ${styles.clientStatusBadgeExists}`}
            role="status"
          >
            <span>✓ Client existent: {clientName}</span>
            <button
              type="button"
              className={styles.clientStatusBadgeClear}
              onClick={() => {
                onClearLink();
                setActiveIndex(-1);
                setIsFocused(true);
                window.requestAnimationFrame(() => {
                  inputRef.current?.focus();
                });
              }}
              aria-label="Deconecteaza clientul existent"
              disabled={disabled}
            >
              ×
            </button>
          </div>
        )}
        {showNewClientBadge && isOwnDentist && (
          <div
            className={`${styles.clientStatusBadge} ${styles.clientStatusBadgeNew}`}
            role="status"
          >
            <span>Client nou — va fi creat la salvare</span>
          </div>
        )}
        {showNewClientBadge && !isOwnDentist && (
          <div
            className={`${styles.clientStatusBadge} ${styles.clientStatusBadgeNew}`}
            role="status"
          >
            <span>Selecteaza un pacient existent — pacientii pot fi adaugati doar de medicul selectat.</span>
          </div>
        )}
      </div>

      <div className={styles.modalFieldRow}>
        <div className={styles.modalField}>
          <label htmlFor="appt-client-email">Email</label>
          <input
            id="appt-client-email"
            type="email"
            value={clientEmail}
            onChange={(event) => onFieldChange('clientEmail', event.target.value)}
            placeholder="ion@example.com"
            disabled={disabled}
            autoComplete="off"
          />
        </div>
        <div className={styles.modalField}>
          <label htmlFor="appt-client-phone">Telefon</label>
          <input
            id="appt-client-phone"
            type="tel"
            value={clientPhone}
            onChange={(event) => onFieldChange('clientPhone', event.target.value)}
            placeholder="07xx xxx xxx"
            disabled={disabled}
            autoComplete="off"
          />
        </div>
      </div>

      <div className={styles.modalField}>
        <label htmlFor="appt-notes">Note</label>
        <textarea
          id="appt-notes"
          value={notes}
          onChange={(event) => onFieldChange('notes', event.target.value)}
          placeholder="Observatii, alergii, instructiuni speciale..."
          rows={3}
          disabled={disabled}
        />
      </div>
    </>
  );
}
