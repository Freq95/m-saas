'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';
import styles from '../../page.module.css';
import type { AvailabilityBlock } from '../../hooks';
import { ConfirmModal } from './ConfirmModal';

export interface AvailabilityBlockFormData {
  id?: number;
  typeLabel: string;
  reason?: string | null;
  startTime: string;
  endTime: string;
  allDay: boolean;
}

interface AvailabilityBlockModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit' | 'view';
  block?: AvailabilityBlock | null;
  initialData?: Partial<AvailabilityBlockFormData> | null;
  onClose: () => void;
  onSubmit: (data: AvailabilityBlockFormData) => Promise<void>;
  onDelete?: (block: AvailabilityBlock) => Promise<void>;
}

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'yyyy-MM-dd');
}

function toTimeInputValue(value?: string | null) {
  if (!value) return '09:00';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '09:00';
  return format(date, 'HH:mm');
}

function composeIso(date: string, time: string, endOfDay = false) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const next = new Date(y, (m || 1) - 1, d || 1, endOfDay ? 23 : (hh || 0), endOfDay ? 59 : (mm || 0), endOfDay ? 59 : 0, 0);
  return next.toISOString();
}

function openPicker(event: { currentTarget: HTMLInputElement }) {
  const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
  if (typeof input.showPicker !== 'function') return;
  try {
    input.showPicker();
  } catch {
    // Browser only allows showPicker from direct user gestures.
  }
}

export function AvailabilityBlockModal({
  isOpen,
  mode,
  block = null,
  initialData = null,
  onClose,
  onSubmit,
  onDelete,
}: AvailabilityBlockModalProps) {
  const backdropPressStartedRef = useRef(false);
  const [typeLabel, setTypeLabel] = useState('');
  const [reason, setReason] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startClock, setStartClock] = useState('09:00');
  const [endClock, setEndClock] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const readOnly = mode === 'view';
  useEffect(() => {
    if (!isOpen) return;
    const start = initialData?.startTime || block?.start_time || new Date().toISOString();
    const end = initialData?.endTime || block?.end_time || new Date(Date.now() + 60 * 60_000).toISOString();
    setTypeLabel(initialData?.typeLabel || block?.type_label || '');
    setReason(initialData?.reason || block?.reason || '');
    setStartDate(toDateInputValue(start));
    setEndDate(toDateInputValue(end));
    setStartClock(toTimeInputValue(start));
    setEndClock(toTimeInputValue(end));
    setAllDay(Boolean(initialData?.allDay ?? block?.all_day ?? false));
    setError(null);
    setBusy(false);
    setConfirmDeleteOpen(false);
  }, [block, initialData, isOpen]);

  if (!isOpen) return null;

  const submit = async () => {
    if (readOnly) return;
    const normalizedType = typeLabel.trim();
    if (!normalizedType) {
      setError('Completeaza tipul blocajului.');
      return;
    }
    if (!startDate || !endDate) {
      setError('Completeaza datele.');
      return;
    }
    const startIso = composeIso(startDate, allDay ? '00:00' : startClock);
    const endIso = composeIso(endDate, allDay ? '23:59' : endClock, allDay);
    if (new Date(startIso) >= new Date(endIso)) {
      setError('Ora de final trebuie sa fie dupa inceput.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        id: block?.id,
        typeLabel: normalizedType,
        reason: reason.trim() || null,
        startTime: startIso,
        endTime: endIso,
        allDay,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nu am putut salva blocajul.');
    } finally {
      setBusy(false);
    }
  };

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    backdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (backdropPressStartedRef.current && event.target === event.currentTarget && !busy) onClose();
    backdropPressStartedRef.current = false;
  };

  const handleConfirmDelete = async () => {
    if (!block || !onDelete) return;
    await onDelete(block);
    setConfirmDeleteOpen(false);
  };

  const title = mode === 'create' ? 'Blocaj de disponibilitate' : readOnly ? 'Detalii blocaj' : 'Editeaza blocaj';

  return (
    <div className={styles.modalOverlay} onPointerDown={handleBackdropPointerDown} onClick={handleBackdropClick}>
      <div className={`${styles.modal} ${styles.createSheet}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.modalHeader}>
          <h3>{title}</h3>
          <button type="button" className={styles.modalIconButton} onClick={onClose} disabled={busy} aria-label="Inchide">x</button>
        </div>

        <div className={styles.modalContent}>
          {error && <div className={`${styles.feedbackBanner} ${styles.feedbackBannerError}`}>{error}</div>}

          {readOnly ? (
            <>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>Tip</span>
                <span className={styles.previewValue}>{block?.type_label}</span>
              </div>
              <div className={styles.previewRow}>
                <span className={styles.previewLabel}>Data si ora</span>
                <span className={styles.previewValue}>
                  {block && `${format(new Date(block.start_time), "EEEE, d MMMM yyyy 'la' HH:mm", { locale: ro })} - ${format(new Date(block.end_time), 'HH:mm', { locale: ro })}`}
                </span>
              </div>
              {block?.reason && (
                <div className={styles.previewRow}>
                  <span className={styles.previewLabel}>Motiv</span>
                  <span className={styles.previewValue}>{block.reason}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className={styles.modalField}>
                <label htmlFor="availability-type">Tip *</label>
                <input id="availability-type" value={typeLabel} onChange={(event) => setTypeLabel(event.target.value)} maxLength={80} placeholder="Curs, concediu, colaborator..." disabled={busy} />
              </div>
              <div className={styles.modalField}>
                <label htmlFor="availability-reason">Motiv</label>
                <textarea id="availability-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={3} placeholder="Detalii utile pentru echipa..." disabled={busy} />
              </div>
              <label className={styles.modalFieldLabelRow}>
                <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} disabled={busy} />
                <span>Toata ziua</span>
              </label>
              <div className={styles.modalFieldRow}>
                <div className={styles.modalField}>
                  <label htmlFor="availability-start-date">Data inceput</label>
                  <input id="availability-start-date" type="date" value={startDate} onClick={openPicker} onFocus={openPicker} onChange={(event) => {
                    setStartDate(event.target.value);
                    if (!endDate || endDate < event.target.value) setEndDate(event.target.value);
                  }} disabled={busy} />
                </div>
                {!allDay && (
                  <div className={styles.modalField}>
                    <label htmlFor="availability-start-time">Ora inceput</label>
                    <input id="availability-start-time" type="time" value={startClock} step={900} onClick={openPicker} onFocus={openPicker} onChange={(event) => setStartClock(event.target.value)} disabled={busy} />
                  </div>
                )}
              </div>
              <div className={styles.modalFieldRow}>
                <div className={styles.modalField}>
                  <label htmlFor="availability-end-date">Data final</label>
                  <input id="availability-end-date" type="date" value={endDate} onClick={openPicker} onFocus={openPicker} onChange={(event) => setEndDate(event.target.value)} disabled={busy} />
                </div>
                {!allDay && (
                  <div className={styles.modalField}>
                    <label htmlFor="availability-end-time">Ora final</label>
                    <input id="availability-end-time" type="time" value={endClock} step={900} onClick={openPicker} onFocus={openPicker} onChange={(event) => setEndClock(event.target.value)} disabled={busy} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className={styles.modalActions}>
          {mode !== 'create' && block?.can_delete && onDelete && (
            <button type="button" className={styles.deleteButton} disabled={busy} onClick={() => setConfirmDeleteOpen(true)}>Sterge</button>
          )}
          {readOnly && block?.can_edit && (
            <button type="button" className={styles.editButton} disabled={busy} onClick={() => setError('Deschide editarea din Setari > Calendare pentru modificari complete.')}>Editeaza</button>
          )}
          <button type="button" className={styles.cancelButton} onClick={onClose} disabled={busy}>{readOnly ? 'Inchide' : 'Renunta'}</button>
          {!readOnly && (
            <button type="button" className={styles.saveButton} onClick={submit} disabled={busy}>{busy ? 'Se salveaza...' : 'Salveaza'}</button>
          )}
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmDeleteOpen}
        title="Stergere blocaj"
        message={`Sigur vrei sa stergi blocajul${block?.type_label ? ` "${block.type_label}"` : ''}?`}
        confirmLabel="Sterge"
        cancelLabel="Renunta"
        tone="danger"
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
