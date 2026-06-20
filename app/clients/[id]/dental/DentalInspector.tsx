'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { authFetcher } from '@/lib/fetcher';
import {
  EVENT_ACTION_LABEL_RO,
  EVENT_ACTIONS,
  ISSUE_COLOR,
  ISSUE_LABEL_RO,
  ISSUE_TYPES,
  SEVERITIES,
  SEVERITY_LABEL_RO,
  STATUS_LABEL_RO,
  SURFACES,
  TOOTH_STATUSES,
  dentitionOf,
  isUpper,
  surfaceLabel,
  type Dentition,
  type EventAction,
  type IssueType,
  type Severity,
  type Surface,
  type ToothStatus,
} from '@/lib/dental/constants';
import type { DentalData, ToothEventDoc, ToothStateDoc } from '@/lib/server/dental';
import styles from './DentalTab.module.css';

export type RecordKind = 'tooth' | 'surgery' | 'bridge';
export type InspectorView = 'today' | 'tooth' | 'recording';

interface Props {
  clientId: string;
  canEdit: boolean;
  dental: DentalData;
  view: InspectorView;
  /** When the view is hosted inside the phone modal, the modal's top bar already
   *  provides the title + cancel, so the form suppresses its own header. */
  chromeless?: boolean;
  selectedFdi: number | null;
  recordKind: RecordKind;
  /** Active dentition — the Today overview is scoped to it for consistency with the chart. */
  dentition: Dentition;
  surgerySelection: number[];
  bridgeSelection: number[];
  onSelectTooth: (fdi: number | null) => void;
  onStartRecording: (kind: RecordKind) => void;
  onSetRecordKind: (kind: RecordKind) => void;
  onCancelRecording: () => void;
  onSubmitTooth: (payload: {
    surfaces: Surface[];
    issue_type: IssueType;
    severity?: Severity;
    notes?: string;
    metadata?: Record<string, string>;
  }) => Promise<void>;
  onSubmitSurgery: (payload: { tooth_fdis: number[]; comment: string }) => Promise<void>;
  onSubmitBridge: (payload: { tooth_fdis: number[]; comment: string }) => Promise<void>;
  onChangeStatus: (status: ToothStatus) => Promise<void> | void;
  onDeleteSurgeryGroup: (id: number) => void;
  onDeleteBridgeGroup: (id: number) => void;
  onDentalUpdate: (d: DentalData) => void;
  onToast: (kind: 'success' | 'error', message: string) => void;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return 'azi';
  if (days === 1) return 'ieri';
  if (days < 30) return `acum ${days} zile`;
  const months = Math.floor(days / 30);
  if (months < 12) return `acum ${months} ${months === 1 ? 'lună' : 'luni'}`;
  return fmtDate(iso);
}

export default function DentalInspector(props: Props) {
  const { view } = props;
  return (
    <aside className={styles.inspector} aria-label="Detalii schemă dentară">
      {view === 'recording' ? (
        <RecordingView {...props} />
      ) : view === 'tooth' && props.selectedFdi !== null ? (
        <ToothView {...props} fdi={props.selectedFdi} />
      ) : (
        <TodayView {...props} />
      )}
    </aside>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TODAY VIEW — default. Onboarding checklist when empty, else activity feed.
   ───────────────────────────────────────────────────────────────────────── */
function TodayView({ dental, dentition, canEdit, onStartRecording, onSelectTooth }: Props) {
  // Scope the overview to the active dentition so it never lists a tooth the
  // chart isn't drawing. The cross-dentition hint in the header surfaces the rest.
  const affected = dental.tooth_states.filter(
    (s) => (s.current_issues.length > 0 || s.status !== 'present') && dentitionOf(s.tooth_fdi) === dentition
  );
  const isEmpty =
    dental.tooth_states.every((s) => s.current_issues.length === 0 && s.status === 'present') &&
    dental.surgery_groups.length === 0 &&
    dental.bridge_groups.length === 0;

  // Recent activity = latest events across teeth in this dentition, newest first.
  const recent = useMemo(() => {
    return Object.values(dental.latest_event_by_tooth)
      .filter((e) => dentitionOf(e.tooth_fdi) === dentition)
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
      .slice(0, 8);
  }, [dental.latest_event_by_tooth, dentition]);

  if (isEmpty) {
    return (
      <div className={styles.inspBody}>
        <span className={styles.kicker}>Pacient nou</span>
        <h2 className={styles.inspTitle}>Începe examinarea</h2>
        <p className={styles.inspLead}>
          Schema dentară este goală. Câțiva pași pentru a o popula:
        </p>
        <ol className={styles.checklist}>
          <li>
            <span className={styles.checklistDot}>1</span>
            <div>
              <strong>Marchează dinții lipsă sau lucrările existente</strong>
              <span>Selectează un dinte și setează starea (lipsă, coroană, implant).</span>
            </div>
          </li>
          <li>
            <span className={styles.checklistDot}>2</span>
            <div>
              <strong>Înregistrează diagnosticele</strong>
              <span>Carii, gingivită, parodontită — cu suprafețele afectate.</span>
            </div>
          </li>
          <li>
            <span className={styles.checklistDot}>3</span>
            <div>
              <strong>Notează intervențiile</strong>
              <span>Chirurgie sau punți care cuprind mai mulți dinți.</span>
            </div>
          </li>
        </ol>
        {canEdit && (
          <button type="button" className={styles.primaryAction} onClick={() => onStartRecording('tooth')}>
            <PlusIcon /> Înregistrează prima intervenție
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.inspBody}>
      <span className={styles.kicker}>Privire de ansamblu</span>
      <h2 className={styles.inspTitle}>Astăzi</h2>

      <div className={styles.statRow}>
        <div className={styles.statCell}>
          <span className={styles.statNum}>{affected.length}</span>
          <span className={styles.statLbl}>dinți de urmărit</span>
        </div>
        <div className={styles.statCell}>
          <span className={styles.statNum}>{dental.surgery_groups.length}</span>
          <span className={styles.statLbl}>chirurgie</span>
        </div>
        <div className={styles.statCell}>
          <span className={styles.statNum}>{dental.bridge_groups.length}</span>
          <span className={styles.statLbl}>punți</span>
        </div>
      </div>

      <div className={styles.sectionLabel}>Activitate recentă</div>
      <ul className={styles.activityList}>
        {recent.length === 0 && <li className={styles.activityEmpty}>Niciun eveniment recent.</li>}
        {recent.map((e) => (
          <li key={e.id}>
            <button type="button" className={styles.activityRow} onClick={() => onSelectTooth(e.tooth_fdi)}>
              <span className={styles.activityDot} style={{ background: ISSUE_COLOR[e.issue_type] }} />
              <span className={styles.activityMain}>
                <span className={styles.activityFdi}>{e.tooth_fdi}</span>
                <span className={styles.activityIssue}>{ISSUE_LABEL_RO[e.issue_type]}</span>
              </span>
              <span className={styles.activityWhen}>{fmtRelative(e.occurred_at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TOOTH VIEW — selected tooth: hero, status menu, issues, Detalii | Istoric.
   ───────────────────────────────────────────────────────────────────────── */
function ToothView(props: Props & { fdi: number }) {
  const { fdi, dental, canEdit, chromeless, onSelectTooth, onStartRecording, onChangeStatus } = props;
  const state = dental.tooth_states.find((s) => s.tooth_fdi === fdi);
  const latest = dental.latest_event_by_tooth[fdi];
  const [tab, setTab] = useState<'detalii' | 'istoric'>('detalii');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const arch = isUpper(fdi) ? 'Maxilar' : 'Mandibulă';
  const issues = state?.current_issues ?? [];

  useEffect(() => {
    setTab('detalii');
    setStatusMenuOpen(false);
  }, [fdi]);

  useEffect(() => {
    if (!statusMenuOpen) return;
    const h = (e: MouseEvent) => {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [statusMenuOpen]);

  return (
    <div className={styles.inspBody}>
      {/* The phone modal's top bar already provides "Închide"; only the desktop
          panel needs this back link. */}
      {!chromeless && (
        <div className={styles.inspTopRow}>
          <button type="button" className={styles.backLink} onClick={() => onSelectTooth(null)}>
            ← Înapoi
          </button>
        </div>
      )}

      <div className={styles.toothHeader}>
        <div className={styles.toothBadge}>
          <span className={styles.toothBadgeNum}>{fdi}</span>
        </div>
        <div className={styles.toothHeaderMeta}>
          <span className={styles.kicker}>{arch}</span>
          <h2 className={styles.inspTitle}>Dinte {fdi}</h2>
          <span className={styles.toothLastManip}>
            Ultima modificare · {fmtDate(state?.last_manipulation_at)}
          </span>
        </div>
      </div>

      {/* Status as a single pill that opens a menu — not 6 buttons */}
      <div className={styles.statusField} ref={statusRef}>
        <span className={styles.fieldLabel}>Stare</span>
        {canEdit ? (
          <div className={styles.statusPillWrap}>
            <button
              type="button"
              className={styles.statusPill}
              onClick={() => setStatusMenuOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={statusMenuOpen}
            >
              {STATUS_LABEL_RO[state?.status ?? 'present']}
              <ChevronIcon />
            </button>
            {statusMenuOpen && (
              <ul className={styles.statusMenu} role="listbox">
                {TOOTH_STATUSES.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={state?.status === s}
                      className={`${styles.statusMenuItem} ${state?.status === s ? styles.statusMenuItemActive : ''}`}
                      onClick={() => {
                        void onChangeStatus(s);
                        setStatusMenuOpen(false);
                      }}
                    >
                      {STATUS_LABEL_RO[s]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <span className={styles.statusReadonly}>{STATUS_LABEL_RO[state?.status ?? 'present']}</span>
        )}
      </div>

      <div className={styles.tabBar}>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === 'detalii' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('detalii')}
        >
          Detalii
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${tab === 'istoric' ? styles.tabBtnActive : ''}`}
          onClick={() => setTab('istoric')}
        >
          Istoric
        </button>
      </div>

      {tab === 'detalii' ? (
        <div className={styles.tabPanel}>
          {issues.length === 0 ? (
            <p className={styles.inspLead}>Niciun diagnostic activ pe acest dinte.</p>
          ) : (
            <ul className={styles.issueList}>
              {issues.map((iss) => (
                <li key={iss.issue_type} className={styles.issueRow}>
                  <span className={styles.issueDot} style={{ background: ISSUE_COLOR[iss.issue_type] }} />
                  <span className={styles.issueName}>{ISSUE_LABEL_RO[iss.issue_type]}</span>
                  <span className={styles.issueSurfaces}>
                    {iss.surfaces.length === 0
                      ? 'Întreg dintele'
                      : iss.surfaces.map((s: Surface) => surfaceLabel(s, fdi)).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {latest?.notes && <p className={styles.notesBlock}>{latest.notes}</p>}

          {latest && (
            <dl className={styles.detailGrid}>
              <Row label="Medic" value={latest.doctor_name_snapshot || '—'} />
              {latest.metadata?.implant_manufacturer ? (
                <Row label="Producător" value={String(latest.metadata.implant_manufacturer)} />
              ) : null}
              {latest.metadata?.implant_model ? (
                <Row label="Model" value={String(latest.metadata.implant_model)} />
              ) : null}
              {latest.metadata?.implant_sizes ? (
                <Row label="Dimensiuni" value={String(latest.metadata.implant_sizes)} />
              ) : null}
            </dl>
          )}

          {canEdit && (
            <button type="button" className={styles.primaryAction} onClick={() => onStartRecording('tooth')}>
              <PlusIcon /> Înregistrează pe dinte {fdi}
            </button>
          )}
        </div>
      ) : (
        <ToothTimeline {...props} fdi={fdi} />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detailRow}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   TOOTH TIMELINE — inline (was a modal). Edit + delete per row for dentists.
   ───────────────────────────────────────────────────────────────────────── */
type EditDraft = { eventId: number; notes: string; action: EventAction; severity: Severity | '' };

function ToothTimeline({
  clientId,
  fdi,
  canEdit,
  onDentalUpdate,
  onToast,
}: Props & { fdi: number }) {
  const { data, isLoading, error, mutate } = useSWR<{ events: ToothEventDoc[] }>(
    `/api/clients/${clientId}/dental/teeth/${fdi}/events`,
    authFetcher
  );
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(null);
    setPendingDelete(null);
  }, [fdi]);

  const events = data?.events ?? [];

  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dental/events/${draft.eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes: draft.notes,
          action: draft.action,
          severity: draft.severity === '' ? undefined : draft.severity,
        }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { dental: DentalData };
      await mutate();
      onDentalUpdate(body.dental);
      onToast('success', 'Eveniment actualizat.');
      setDraft(null);
    } catch {
      onToast('error', 'Nu s-a putut actualiza evenimentul.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (pendingDelete === null || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/dental/events/${pendingDelete}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { dental: DentalData };
      await mutate();
      onDentalUpdate(body.dental);
      onToast('success', 'Eveniment șters.');
      setPendingDelete(null);
    } catch {
      onToast('error', 'Nu s-a putut șterge evenimentul.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <div className={styles.tabPanel}><p className={styles.inspLead}>Se încarcă…</p></div>;
  if (error) return <div className={styles.tabPanel}><p className={styles.inspLead}>Eroare la încărcare.</p></div>;
  if (events.length === 0)
    return <div className={styles.tabPanel}><p className={styles.inspLead}>Niciun eveniment pentru acest dinte.</p></div>;

  return (
    <div className={styles.tabPanel}>
      <ol className={styles.timeline}>
        {events.map((e) => {
          const editing = draft?.eventId === e.id;
          const deleting = pendingDelete === e.id;
          return (
            <li key={e.id} className={styles.tlRow}>
              <span className={styles.tlDot} style={{ background: ISSUE_COLOR[e.issue_type] }} />
              <div className={styles.tlContent}>
                <div className={styles.tlHead}>
                  <span className={styles.tlIssue}>{ISSUE_LABEL_RO[e.issue_type]}</span>
                  <span className={styles.tlDate}>{fmtDate(e.occurred_at)}</span>
                </div>

                {editing && draft ? (
                  <div className={styles.tlEdit}>
                    <label className={styles.miniField}>
                      <span>Acțiune</span>
                      <select value={draft.action} onChange={(ev) => setDraft({ ...draft, action: ev.target.value as EventAction })}>
                        {EVENT_ACTIONS.map((a) => <option key={a} value={a}>{EVENT_ACTION_LABEL_RO[a]}</option>)}
                      </select>
                    </label>
                    <label className={styles.miniField}>
                      <span>Severitate</span>
                      <select value={draft.severity} onChange={(ev) => setDraft({ ...draft, severity: ev.target.value as Severity | '' })}>
                        <option value="">—</option>
                        {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABEL_RO[s]}</option>)}
                      </select>
                    </label>
                    <label className={styles.miniField}>
                      <span>Note</span>
                      <textarea value={draft.notes} rows={3} maxLength={2000} onChange={(ev) => setDraft({ ...draft, notes: ev.target.value })} />
                    </label>
                    <div className={styles.miniActions}>
                      <button type="button" className={styles.ghostSm} onClick={() => setDraft(null)} disabled={busy}>Anulează</button>
                      <button type="button" className={styles.primarySm} onClick={save} disabled={busy}>{busy ? '…' : 'Salvează'}</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.tlMeta}>
                      <span className={styles.tlPill}>{EVENT_ACTION_LABEL_RO[e.action]}</span>
                      {e.severity && <span className={styles.tlPill}>{SEVERITY_LABEL_RO[e.severity]}</span>}
                      <span className={styles.tlSurfaces}>
                        {e.surfaces && e.surfaces.length > 0
                          ? e.surfaces.map((s: Surface) => surfaceLabel(s, fdi)).join(' · ')
                          : 'Întreg dintele'}
                      </span>
                    </div>
                    {e.doctor_name_snapshot && <div className={styles.tlDoctor}>de {e.doctor_name_snapshot}</div>}
                    {e.notes && <p className={styles.tlNotes}>{e.notes}</p>}
                    {canEdit && (
                      deleting ? (
                        <div className={styles.tlDeleteConfirm}>
                          <span>Confirmi ștergerea?</span>
                          <button type="button" className={styles.ghostSm} onClick={() => setPendingDelete(null)} disabled={busy}>Nu</button>
                          <button type="button" className={styles.dangerSm} onClick={remove} disabled={busy}>{busy ? '…' : 'Șterge'}</button>
                        </div>
                      ) : (
                        <div className={styles.tlActions}>
                          <button type="button" className={styles.tlActionBtn} onClick={() => { setPendingDelete(null); setDraft({ eventId: e.id, notes: e.notes ?? '', action: e.action, severity: e.severity ?? '' }); }}>Editează</button>
                          <button type="button" className={`${styles.tlActionBtn} ${styles.tlActionDanger}`} onClick={() => { setDraft(null); setPendingDelete(e.id); }}>Șterge</button>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   RECORDING VIEW — single funnel. Kind selector → scoped form. No modals.
   ───────────────────────────────────────────────────────────────────────── */
function RecordingView({
  recordKind,
  selectedFdi,
  surgerySelection,
  bridgeSelection,
  chromeless,
  onSetRecordKind,
  onCancelRecording,
  onSubmitTooth,
  onSubmitSurgery,
  onSubmitBridge,
}: Props) {
  // Tooth-diagnostic local form state
  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [wholeTooth, setWholeTooth] = useState(true);
  const [issueType, setIssueType] = useState<IssueType>('caries');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [notes, setNotes] = useState('');
  const [imMan, setImMan] = useState('');
  const [imModel, setImModel] = useState('');
  const [imSizes, setImSizes] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset only when the *kind* changes (different form). The fields are
  // tooth-agnostic, so re-targeting a tooth must NOT wipe in-progress entries —
  // a mis-tap on a neighbour shouldn't cost the user their notes.
  useEffect(() => {
    setSurfaces([]);
    setWholeTooth(true);
    setIssueType('caries');
    setSeverity('');
    setNotes('');
    setImMan('');
    setImModel('');
    setImSizes('');
  }, [recordKind]);

  useEffect(() => {
    setComment('');
  }, [recordKind]);

  const toggleSurface = (s: Surface) => {
    setWholeTooth(false);
    setSurfaces((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const submitTooth = async () => {
    if (selectedFdi === null || busy) return;
    setBusy(true);
    const metadata: Record<string, string> = {};
    if (issueType === 'implantation') {
      if (imMan) metadata.implant_manufacturer = imMan;
      if (imModel) metadata.implant_model = imModel;
      if (imSizes) metadata.implant_sizes = imSizes;
    }
    try {
      await onSubmitTooth({
        surfaces: wholeTooth ? [] : surfaces,
        issue_type: issueType,
        severity: severity || undefined,
        notes: notes.trim() || undefined,
        metadata: Object.keys(metadata).length ? metadata : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const submitGroup = async (kind: 'surgery' | 'bridge') => {
    if (busy) return;
    const fdis = kind === 'surgery' ? surgerySelection : bridgeSelection;
    const min = kind === 'surgery' ? 1 : 2;
    if (fdis.length < min) return;
    setBusy(true);
    try {
      if (kind === 'surgery') await onSubmitSurgery({ tooth_fdis: fdis, comment: comment.trim() });
      else await onSubmitBridge({ tooth_fdis: fdis, comment: comment.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.inspBody}>
      {/* On the phone modal the top bar owns the title + cancel; only the
          desktop panel and the surgery/bridge bottom panel show this header. */}
      {!chromeless && (
        <>
          <div className={styles.inspTopRow}>
            <button type="button" className={styles.backLink} onClick={onCancelRecording}>← Anulează</button>
          </div>
          <span className={styles.kicker}>Înregistrează</span>
          <h2 className={styles.inspTitle}>Intervenție nouă</h2>
        </>
      )}

      {/* Kind selector — single funnel */}
      <div className={styles.kindSelector} role="tablist" aria-label="Tip intervenție">
        {(['tooth', 'surgery', 'bridge'] as RecordKind[]).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={recordKind === k}
            className={`${styles.kindBtn} ${recordKind === k ? styles.kindBtnActive : ''}`}
            onClick={() => onSetRecordKind(k)}
          >
            {k === 'tooth' ? 'Dinte' : k === 'surgery' ? 'Chirurgie' : 'Punte'}
          </button>
        ))}
      </div>

      {recordKind === 'tooth' ? (
        <div className={styles.recordForm}>
          {/* Target tooth */}
          <div className={styles.targetRow}>
            <span className={styles.fieldLabel}>Dinte</span>
            {selectedFdi === null ? (
              <span className={styles.targetPrompt}>Apasă pe un dinte în schemă →</span>
            ) : (
              <span className={styles.targetChip}>{selectedFdi} · {isUpper(selectedFdi) ? 'Maxilar' : 'Mandibulă'}</span>
            )}
          </div>

          {/* Surfaces */}
          <fieldset className={styles.formGroup}>
            <legend className={styles.fieldLabel}>Suprafețe</legend>
            <label className={styles.wholeToothRow}>
              <input
                type="checkbox"
                checked={wholeTooth}
                onChange={(e) => { setWholeTooth(e.target.checked); if (e.target.checked) setSurfaces([]); }}
              />
              <span>Întreg dintele</span>
            </label>
            <div className={styles.surfaceChips}>
              {SURFACES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${styles.surfaceChip} ${!wholeTooth && surfaces.includes(s) ? styles.surfaceChipActive : ''}`}
                  onClick={() => toggleSurface(s)}
                  aria-pressed={!wholeTooth && surfaces.includes(s)}
                  disabled={wholeTooth}
                  title={selectedFdi !== null ? surfaceLabel(s, selectedFdi) : s}
                >
                  {s}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Issue type */}
          <fieldset className={styles.formGroup}>
            <legend className={styles.fieldLabel}>Tip</legend>
            <div className={styles.issueChips}>
              {ISSUE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${styles.issueChip} ${issueType === t ? styles.issueChipActive : ''}`}
                  onClick={() => setIssueType(t)}
                  aria-pressed={issueType === t}
                  style={issueType === t ? { borderColor: ISSUE_COLOR[t], background: `color-mix(in srgb, ${ISSUE_COLOR[t]} 14%, transparent)` } : undefined}
                >
                  <span className={styles.issueChipDot} style={{ background: ISSUE_COLOR[t] }} />
                  {ISSUE_LABEL_RO[t]}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Severity */}
          <fieldset className={styles.formGroup}>
            <legend className={styles.fieldLabel}>Severitate <span className={styles.optional}>(opțional)</span></legend>
            <div className={styles.severityRow}>
              {SEVERITIES.map((s) => (
                <label key={s} className={`${styles.sevChip} ${severity === s ? styles.sevChipActive : ''}`}>
                  <input type="radio" name="rec-sev" checked={severity === s} onChange={() => setSeverity(s)} />
                  <span>{SEVERITY_LABEL_RO[s]}</span>
                </label>
              ))}
              {severity && (
                <button type="button" className={styles.sevClear} onClick={() => setSeverity('')}>Resetează</button>
              )}
            </div>
          </fieldset>

          {/* Notes */}
          <fieldset className={styles.formGroup}>
            <legend className={styles.fieldLabel}>Note</legend>
            <textarea
              className={styles.textarea}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Detalii clinice, recomandări…"
            />
          </fieldset>

          {issueType === 'implantation' && (
            <fieldset className={styles.formGroup}>
              <legend className={styles.fieldLabel}>Detalii implant</legend>
              <div className={styles.implantGrid}>
                <label className={styles.miniField}><span>Producător</span><input value={imMan} onChange={(e) => setImMan(e.target.value)} placeholder="Nobel Replace" /></label>
                <label className={styles.miniField}><span>Model</span><input value={imModel} onChange={(e) => setImModel(e.target.value)} placeholder="Replace Tapered" /></label>
                <label className={styles.miniField}><span>Dimensiuni</span><input value={imSizes} onChange={(e) => setImSizes(e.target.value)} placeholder="3.5mm × 10mm" /></label>
              </div>
            </fieldset>
          )}

          {/* In the phone modal the top bar already owns the cancel, so the
              footer drops its redundant Anulează and the save goes full-width. */}
          <div className={`${styles.recordFooter} ${chromeless ? styles.recordFooterSolo : ''}`}>
            {!chromeless && (
              <button type="button" className={styles.ghostAction} onClick={onCancelRecording} disabled={busy}>Anulează</button>
            )}
            <button
              type="button"
              className={styles.primaryAction}
              onClick={submitTooth}
              disabled={busy || selectedFdi === null || (!wholeTooth && surfaces.length === 0)}
            >
              {busy ? 'Se salvează…' : 'Salvează'}
            </button>
          </div>
        </div>
      ) : (
        // Surgery / Bridge — pick teeth on the chart
        <div className={styles.recordForm}>
          <div className={styles.pickBanner}>
            <span className={styles.pickInstruction}>Apasă pe dinți în schemă pentru a-i selecta.</span>
            <span className={styles.pickCount}>
              {(recordKind === 'surgery' ? surgerySelection : bridgeSelection).length}
              {recordKind === 'bridge' ? ' / 2 minim' : ' selectați'}
            </span>
          </div>

          {(() => {
            const fdis = (recordKind === 'surgery' ? surgerySelection : bridgeSelection).slice().sort((a, b) => a - b);
            const up = fdis.filter(isUpper);
            const lo = fdis.filter((f) => !isUpper(f));
            return (
              <div className={styles.pickSummary}>
                {up.length > 0 && <p><strong>Maxilar:</strong> {up.join(', ')}</p>}
                {lo.length > 0 && <p><strong>Mandibulă:</strong> {lo.join(', ')}</p>}
                {fdis.length === 0 && <p className={styles.inspLead}>Niciun dinte selectat încă.</p>}
              </div>
            );
          })()}

          <fieldset className={styles.formGroup}>
            <legend className={styles.fieldLabel}>
              Comentariu {recordKind === 'surgery' && <span className={styles.optional}>(necesar)</span>}
            </legend>
            <textarea
              className={styles.textarea}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={recordKind === 'surgery' ? 'Ex. Extracție molari 26, 27…' : 'Ex. Punte ceramică 24–26…'}
            />
          </fieldset>

          <div className={styles.recordFooter}>
            <button type="button" className={styles.ghostAction} onClick={onCancelRecording} disabled={busy}>Anulează</button>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={() => submitGroup(recordKind === 'surgery' ? 'surgery' : 'bridge')}
              disabled={
                busy ||
                (recordKind === 'surgery'
                  ? surgerySelection.length < 1 || comment.trim().length === 0
                  : bridgeSelection.length < 2)
              }
            >
              {busy ? 'Se salvează…' : 'Salvează'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Icons ─────────────────────────────────────────────────────────────── */
function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function ChevronIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
