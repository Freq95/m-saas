'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CalendarImportOutcome,
  CalendarImportOptions,
  CalendarImportRow,
  CalendarImportRowOverride,
} from '@/lib/calendar-import';
import type { CalendarListItem } from '../../calendar/hooks';
import sharedStyles from '../services/page.module.css';
import styles from './page.module.css';

type ImportStep = 'upload' | 'preview' | 'done';

interface CalendarImportSectionProps {
  role: string;
  calendars: CalendarListItem[];
  notify: {
    success: (message: string) => void;
    warning: (message: string) => void;
    error: (message: string) => void;
  };
}

interface PreviewResponse {
  previewId: string;
  rows: CalendarImportRow[];
  selectedRowIds: string[];
  outcome: CalendarImportOutcome;
  options: CalendarImportOptions;
}

interface ConfirmResponse {
  importBatchId: number;
  projectedOutcome: CalendarImportOutcome;
  actualOutcome: {
    imported: number;
    skippedDuplicates: number;
    skippedConflicts: number;
    skippedPrivate: number;
    invalid: number;
    deselected: number;
    failed: number;
  };
}

const DEFAULT_SERVICE_NAME = 'Eveniment importat';

const emptyOutcome: CalendarImportOutcome = {
  willImport: 0,
  willSkipDuplicates: 0,
  willSkipConflicts: 0,
  willSkipPrivate: 0,
  invalidOrIncomplete: 0,
  recurringInstancesExpanded: 0,
  alreadyDeselected: 0,
  failedRisk: 0,
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ro-RO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function actionLabel(row: CalendarImportRow): string {
  switch (row.projectedAction) {
    case 'import':
      return 'Se importa';
    case 'skip_duplicate':
      return 'Duplicat';
    case 'skip_conflict':
      return 'Conflict';
    case 'skip_private':
      return 'Privat';
    case 'invalid':
      return 'Invalid';
    case 'deselected':
      return 'Neselectat';
    default:
      return 'Verificat';
  }
}

function readError(data: any, fallback: string): string {
  return typeof data?.error === 'string' ? data.error : fallback;
}

export function CalendarImportSection({ role, calendars, notify }: CalendarImportSectionProps) {
  const canImport = role === 'owner' || role === 'dentist';
  const writableCalendars = useMemo(
    () => calendars.filter((calendar) => calendar.permissions?.can_create),
    [calendars]
  );
  const firstCalendarId = writableCalendars[0]?.id ?? 0;

  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<CalendarImportOptions>({
    calendarId: firstCalendarId,
    dentistUserId: null,
    dateRangeStart: '',
    dateRangeEnd: '',
    recurrenceHorizonMonths: 12,
    includeOverlaps: false,
    includePrivate: false,
    duplicateStrategy: 'skip',
    placeholderServiceName: DEFAULT_SERVICE_NAME,
  });
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [rows, setRows] = useState<CalendarImportRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, CalendarImportRowOverride>>({});
  const [outcome, setOutcome] = useState<CalendarImportOutcome>(emptyOutcome);
  const [actualOutcome, setActualOutcome] = useState<ConfirmResponse['actualOutcome'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'import' | 'skipped' | 'conflict'>('all');
  const recalcTimerRef = useRef<number | null>(null);
  const previewTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (firstCalendarId && !options.calendarId) {
      setOptions((current) => ({ ...current, calendarId: firstCalendarId }));
    }
  }, [firstCalendarId, options.calendarId]);

  useEffect(() => {
    return () => {
      if (recalcTimerRef.current) window.clearTimeout(recalcTimerRef.current);
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selectedRowIds), [selectedRowIds]);
  const filteredRows = useMemo(() => {
    if (filter === 'import') return rows.filter((row) => row.projectedAction === 'import');
    if (filter === 'skipped') return rows.filter((row) => row.projectedAction !== 'import');
    if (filter === 'conflict') return rows.filter((row) => row.hasAvailabilityBlock || row.hasOverlap);
    return rows;
  }, [rows, filter]);

  const canConfirm = outcome.willImport > 0 && !busy;

  const submitPreview = async (nextOptions = options) => {
    if (!file) {
      notify.warning('Alege un fisier .ics sau .zip.');
      return;
    }
    if (!nextOptions.calendarId) {
      notify.warning('Alege calendarul in care importi.');
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('options', JSON.stringify(nextOptions));
      const response = await fetch('/api/settings/calendars/import/preview', {
        method: 'POST',
        body: form,
      });
      const data = await response.json().catch(() => null) as PreviewResponse | any;
      if (!response.ok) throw new Error(readError(data, 'Nu am putut pregati importul.'));
      setPreviewId(data.previewId);
      setRows(data.rows || []);
      setSelectedRowIds(data.selectedRowIds || []);
      setOutcome(data.outcome || emptyOutcome);
      setOptions(data.options || nextOptions);
      setActualOutcome(null);
      setStep('preview');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Nu am putut pregati importul.');
    } finally {
      setBusy(false);
    }
  };

  const recalculate = async (
    nextSelected = selectedRowIds,
    nextOverrides = overrides,
    nextOptions = options
  ) => {
    if (!previewId) return;
    try {
      const response = await fetch('/api/settings/calendars/import/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewId,
          options: nextOptions,
          selectedRowIds: nextSelected,
          overrides: nextOverrides,
        }),
      });
      const data = await response.json().catch(() => null) as PreviewResponse | any;
      if (!response.ok) throw new Error(readError(data, 'Nu am putut recalcula importul.'));
      setRows(data.rows || []);
      setOutcome(data.outcome || emptyOutcome);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Nu am putut recalcula importul.');
    }
  };

  const scheduleRecalculate = (
    nextSelected = selectedRowIds,
    nextOverrides = overrides,
    nextOptions = options
  ) => {
    if (!previewId) return;
    if (recalcTimerRef.current) window.clearTimeout(recalcTimerRef.current);
    recalcTimerRef.current = window.setTimeout(() => {
      void recalculate(nextSelected, nextOverrides, nextOptions);
    }, 250);
  };

  const updateOptions = (patch: Partial<CalendarImportOptions>) => {
    const next = { ...options, ...patch };
    setOptions(next);
    const requiresFreshPreview =
      'calendarId' in patch ||
      'dentistUserId' in patch ||
      'dateRangeStart' in patch ||
      'dateRangeEnd' in patch ||
      'recurrenceHorizonMonths' in patch;
    if (previewId && requiresFreshPreview && file) {
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = window.setTimeout(() => {
        void submitPreview(next);
      }, 450);
      return;
    }
    if (previewId) {
      // When the user flips a permissive toggle ON, auto-select rows that
      // become eligible because of it. Without this, the row would stay
      // deselected and the user wouldn't know to manually check it.
      const turningOnPrivate = patch.includePrivate === true && options.includePrivate === false;
      const turningOnOverlaps = patch.includeOverlaps === true && options.includeOverlaps === false;
      let nextSelected = selectedRowIds;
      if (turningOnPrivate || turningOnOverlaps) {
        const selectedSetLocal = new Set(selectedRowIds);
        const additions: string[] = [];
        for (const row of rows) {
          if (selectedSetLocal.has(row.id)) continue;
          if (row.invalidReason || row.duplicate || row.hasAvailabilityBlock) continue;
          const blockedByPrivate = row.isPrivate && !next.includePrivate;
          const blockedByOverlap = row.hasOverlap && !next.includeOverlaps;
          if (blockedByPrivate || blockedByOverlap) continue;
          const becameEligible =
            (turningOnPrivate && row.isPrivate) ||
            (turningOnOverlaps && row.hasOverlap);
          if (becameEligible) additions.push(row.id);
        }
        if (additions.length > 0) {
          nextSelected = [...selectedRowIds, ...additions];
          setSelectedRowIds(nextSelected);
        }
      }
      scheduleRecalculate(nextSelected, overrides, next);
    }
  };

  const toggleRow = (rowId: string) => {
    const next = selectedSet.has(rowId)
      ? selectedRowIds.filter((id) => id !== rowId)
      : [...selectedRowIds, rowId];
    setSelectedRowIds(next);
    scheduleRecalculate(next);
  };

  const selectRows = (nextRows: CalendarImportRow[]) => {
    const next = nextRows.map((row) => row.id);
    setSelectedRowIds(next);
    scheduleRecalculate(next);
  };

  const updateOverride = (rowId: string, clientName: string) => {
    const next = {
      ...overrides,
      [rowId]: { ...overrides[rowId], clientName },
    };
    setOverrides(next);
    scheduleRecalculate(selectedRowIds, next);
  };

  const confirmImport = async () => {
    if (!previewId || !canConfirm) return;
    setBusy(true);
    try {
      const response = await fetch('/api/settings/calendars/import/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          previewId,
          options,
          selectedRowIds,
          overrides,
        }),
      });
      const data = await response.json().catch(() => null) as ConfirmResponse | any;
      if (!response.ok) throw new Error(readError(data, 'Nu am putut importa programarile.'));
      setActualOutcome(data.actualOutcome);
      setStep('done');
      notify.success('Importul calendarului a fost finalizat.');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Nu am putut importa programarile.');
    } finally {
      setBusy(false);
    }
  };

  const resetImport = () => {
    setStep('upload');
    setFile(null);
    setPreviewId(null);
    setRows([]);
    setSelectedRowIds([]);
    setOverrides({});
    setOutcome(emptyOutcome);
    setActualOutcome(null);
    setFilter('all');
  };

  if (!canImport) return null;

  return (
    <section className={styles.section}>
      <div className={styles.importHeader}>
        <div>
          <h3 className={styles.sectionTitle}>Import calendar</h3>
          <p className={styles.sectionCaption}>Incarca un export Google Calendar .ics sau .zip si alege exact ce devine programare Densa.</p>
        </div>
        {step !== 'upload' && (
          <button type="button" className={styles.importGhostButton} onClick={resetImport} disabled={busy}>
            Import nou
          </button>
        )}
      </div>

      <div className={styles.importShell}>
        <div className={styles.importConfig}>
          <label className={styles.importField}>
            <span>Fisier</span>
            <input
              type="file"
              accept=".ics,.zip,text/calendar,application/zip"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              disabled={busy}
            />
          </label>

          <div className={styles.importGrid}>
            <label className={styles.importField}>
              <span>Calendar tinta</span>
              <select
                value={options.calendarId || ''}
                onChange={(event) => updateOptions({ calendarId: Number(event.target.value) })}
                disabled={busy || writableCalendars.length === 0}
              >
                {writableCalendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.importField}>
              <span>Serviciu import</span>
              <input
                value={options.placeholderServiceName}
                onChange={(event) => updateOptions({ placeholderServiceName: event.target.value })}
                disabled={busy}
              />
            </label>
            <label className={styles.importField}>
              <span>De la</span>
              <input
                type="date"
                value={options.dateRangeStart || ''}
                onChange={(event) => updateOptions({ dateRangeStart: event.target.value })}
                disabled={busy}
              />
            </label>
            <label className={styles.importField}>
              <span>Pana la</span>
              <input
                type="date"
                value={options.dateRangeEnd || ''}
                onChange={(event) => updateOptions({ dateRangeEnd: event.target.value })}
                disabled={busy}
              />
            </label>
            <label className={styles.importField}>
              <span>Recurente</span>
              <select
                value={options.recurrenceHorizonMonths}
                onChange={(event) => updateOptions({ recurrenceHorizonMonths: Number(event.target.value) })}
                disabled={busy}
              >
                <option value={3}>3 luni</option>
                <option value={6}>6 luni</option>
                <option value={12}>12 luni</option>
                <option value={24}>24 luni</option>
              </select>
            </label>
          </div>

          <div className={styles.importToggles}>
            <label>
              <input
                type="checkbox"
                checked={options.includeOverlaps}
                onChange={(event) => updateOptions({ includeOverlaps: event.target.checked })}
                disabled={busy}
              />
              <span>Importa suprapunerile</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={options.includePrivate}
                onChange={(event) => updateOptions({ includePrivate: event.target.checked })}
                disabled={busy}
              />
              <span>Include evenimente private</span>
            </label>
          </div>

          <div className={styles.importActions}>
            <button type="button" className={sharedStyles.primaryButton} onClick={() => submitPreview()} disabled={busy || !file || writableCalendars.length === 0}>
              {previewId ? 'Actualizeaza previzualizarea' : 'Previzualizeaza'}
            </button>
            {step === 'preview' && (
              <button type="button" className={sharedStyles.primaryButton} onClick={confirmImport} disabled={!canConfirm}>
                {busy ? 'Se importa...' : `Importa ${outcome.willImport}`}
              </button>
            )}
          </div>
        </div>

        <aside className={styles.importOutcome} aria-live="polite">
          <div className={styles.outcomeHero}>
            <span>Se vor importa</span>
            <strong>{outcome.willImport}</strong>
          </div>
          <div className={styles.outcomeGrid}>
            <span>Duplicate</span><strong>{outcome.willSkipDuplicates}</strong>
            <span>Conflicte</span><strong>{outcome.willSkipConflicts}</strong>
            <span>Private</span><strong>{outcome.willSkipPrivate}</strong>
            <span>Invalide</span><strong>{outcome.invalidOrIncomplete}</strong>
            <span>Recurente extinse</span><strong>{outcome.recurringInstancesExpanded}</strong>
            <span>Neselectate</span><strong>{outcome.alreadyDeselected}</strong>
          </div>
          {step === 'preview' && (
            <p className={styles.outcomeSentence}>
              {outcome.willImport} programari vor fi importate. {outcome.willSkipDuplicates + outcome.willSkipConflicts + outcome.willSkipPrivate + outcome.invalidOrIncomplete + outcome.alreadyDeselected} vor fi sarite.
            </p>
          )}
          {step === 'done' && actualOutcome && (
            <div className={styles.actualOutcome}>
              <strong>Rezultat final</strong>
              <span>{actualOutcome.imported} importate</span>
              <span>{actualOutcome.skippedDuplicates + actualOutcome.skippedConflicts + actualOutcome.skippedPrivate + actualOutcome.invalid + actualOutcome.deselected} sarite</span>
              {actualOutcome.failed > 0 && <span>{actualOutcome.failed} esuate</span>}
            </div>
          )}
        </aside>
      </div>

      {step === 'preview' && (
        <div className={styles.importPreview}>
          <div className={styles.previewToolbar}>
            <div className={styles.previewFilters}>
              {(['all', 'import', 'skipped', 'conflict'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={filter === item ? styles.previewFilterActive : styles.previewFilter}
                  onClick={() => setFilter(item)}
                >
                  {item === 'all' ? 'Toate' : item === 'import' ? 'De importat' : item === 'skipped' ? 'Sarite' : 'Conflicte'}
                </button>
              ))}
            </div>
            <div className={styles.bulkActions}>
              <button type="button" onClick={() => selectRows(rows.filter((row) => !row.invalidReason && !row.duplicate && !row.hasAvailabilityBlock && (!row.hasOverlap || options.includeOverlaps)))}>
                Selecteaza importabile
              </button>
              <button type="button" onClick={() => selectRows(rows.filter((row) => new Date(row.startTime) >= new Date() && !row.invalidReason))}>
                Doar viitoare
              </button>
              <button type="button" onClick={() => selectRows([])}>
                Deselecteaza
              </button>
            </div>
          </div>

          <div className={styles.importTableWrap}>
            <table className={styles.importTable}>
              <thead>
                <tr>
                  <th>Selectie</th>
                  <th>Programare</th>
                  <th>Data</th>
                  <th>Status</th>
                  <th>Pacient</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        disabled={busy || Boolean(row.invalidReason)}
                        aria-label={`Selecteaza ${row.title}`}
                      />
                    </td>
                    <td>
                      <strong>{row.title}</strong>
                      <small>{row.sourceCalendarName || 'ICS'}{row.rawLocation ? ` · ${row.rawLocation}` : ''}</small>
                    </td>
                    <td>
                      <span>{formatDateTime(row.startTime)}</span>
                      <small>{row.durationMinutes} min</small>
                    </td>
                    <td>
                      <span className={`${styles.importStatus} ${row.projectedAction === 'import' ? styles.importStatusOk : ''}`}>
                        {actionLabel(row)}
                      </span>
                    </td>
                    <td>
                      <input
                        value={overrides[row.id]?.clientName ?? row.clientName}
                        onChange={(event) => updateOverride(row.id, event.target.value)}
                        disabled={busy || row.projectedAction === 'invalid'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.importCards}>
            {filteredRows.map((row) => (
              <article key={row.id} className={styles.importCard}>
                <div className={styles.importCardTop}>
                  <input
                    type="checkbox"
                    checked={selectedSet.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                    disabled={busy || Boolean(row.invalidReason)}
                    aria-label={`Selecteaza ${row.title}`}
                  />
                  <div>
                    <strong>{row.title}</strong>
                    <span>{formatDateTime(row.startTime)} · {row.durationMinutes} min</span>
                  </div>
                  <span className={`${styles.importStatus} ${row.projectedAction === 'import' ? styles.importStatusOk : ''}`}>
                    {actionLabel(row)}
                  </span>
                </div>
                <label className={styles.importField}>
                  <span>Pacient</span>
                  <input
                    value={overrides[row.id]?.clientName ?? row.clientName}
                    onChange={(event) => updateOverride(row.id, event.target.value)}
                    disabled={busy || row.projectedAction === 'invalid'}
                  />
                </label>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
