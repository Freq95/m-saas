'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { authFetcher } from '@/lib/fetcher';
import Odontogram from './Odontogram';
import IssueDistributionChart from './IssueDistributionChart';
import DentalInspector, { type InspectorView, type RecordKind } from './DentalInspector';
import type { DentalData, ToothStateDoc } from '@/lib/server/dental';
import {
  DENTITION_LABEL_RO,
  dentitionOf,
  type Dentition,
  type IssueType,
  type Severity,
  type Surface,
  type ToothStatus,
} from '@/lib/dental/constants';
import styles from './DentalTab.module.css';

const DENTITION_STORAGE_PREFIX = 'densa.dental.dentition.';

interface Props {
  clientId: string;
  canEdit: boolean;
  onToast: (kind: 'success' | 'error', message: string) => void;
  clientName?: string;
  /** When true and there's no saved preference or data, the chart defaults to deciduous. */
  isMinor?: boolean;
}

/** Mobile bottom-sheet snap states. 'half' keeps the chart tappable above the sheet. */
type SheetMode = 'collapsed' | 'half' | 'expanded';

type DentalResponse = { dental: DentalData };

export default function DentalTab({ clientId, canEdit, onToast, clientName, isMinor }: Props) {
  const { data, error, isLoading, mutate } = useSWR<DentalResponse>(
    `/api/clients/${clientId}/dental`,
    authFetcher
  );

  const [view, setView] = useState<InspectorView>('today');
  const [selectedFdi, setSelectedFdi] = useState<number | null>(null);
  const [recordKind, setRecordKind] = useState<RecordKind>('tooth');
  const [surgerySelection, setSurgerySelection] = useState<number[]>([]);
  const [bridgeSelection, setBridgeSelection] = useState<number[]>([]);
  const [dentition, setDentition] = useState<Dentition>('permanent');
  const [sheetMode, setSheetMode] = useState<SheetMode>('collapsed'); // mobile bottom sheet
  // True once the dentition has been pinned — by a stored preference, an
  // explicit toggle, or a one-time auto-pick from the data. Prevents the
  // auto-pick from fighting a user's choice.
  const dentitionResolved = useRef(false);

  const dental = data?.dental;

  // A tooth "matters" for dentition purposes if it has issues or a non-default
  // status. Used both for auto-pick and the cross-dentition hint.
  const toothMatters = (s: ToothStateDoc) => s.current_issues.length > 0 || s.status !== 'present';

  // 1) Stored preference wins, applied on mount.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DENTITION_STORAGE_PREFIX + clientId);
      if (stored === 'permanent' || stored === 'deciduous') {
        setDentition(stored);
        dentitionResolved.current = true;
      }
    } catch { /* private mode */ }
  }, [clientId]);

  // 2) Otherwise, once data loads, auto-pick the dentition that actually has
  //    records (only when everything sits in the deciduous set).
  useEffect(() => {
    if (dentitionResolved.current || !dental) return;
    const affected = dental.tooth_states.filter(toothMatters);
    const hasPermanent = affected.some((s) => dentitionOf(s.tooth_fdi) === 'permanent');
    const hasDeciduous = affected.some((s) => dentitionOf(s.tooth_fdi) === 'deciduous');
    if (hasDeciduous && !hasPermanent) {
      setDentition('deciduous');
    } else if (affected.length === 0 && isMinor) {
      // New minor patient with no records yet → start on the child dentition.
      setDentition('deciduous');
    }
    dentitionResolved.current = true;
  }, [dental, isMinor]);

  // Explicit user choice — pins + persists.
  const pickDentition = (d: Dentition) => {
    setDentition(d);
    dentitionResolved.current = true;
    try { window.localStorage.setItem(DENTITION_STORAGE_PREFIX + clientId, d); } catch { /* ignore */ }
  };

  if (isLoading) return <div className={styles.tabLoading}>Se încarcă schema dentară…</div>;
  if (error || !dental) return <div className={styles.tabError}>Nu s-a putut încărca schema dentară.</div>;

  // ── Navigation / view state ──────────────────────────────────────────────
  const goToTooth = (fdi: number | null) => {
    if (fdi === null) {
      setSelectedFdi(null);
      setView('today');
      setSheetMode('collapsed');
    } else {
      setSelectedFdi(fdi);
      setView('tooth');
      setSheetMode('expanded'); // detail needs no chart interaction
    }
  };

  const startRecording = (kind: RecordKind) => {
    setRecordKind(kind);
    setSurgerySelection([]);
    setBridgeSelection([]);
    if (kind !== 'tooth') setSelectedFdi(null);
    setView('recording');
    // Mobile sheet: 'expanded' when the form is ready (tooth already chosen);
    // 'half' when the user must still tap teeth on the chart, so both the chart
    // (top) and the form/count (bottom) are visible at once.
    setSheetMode(kind === 'tooth' && selectedFdi !== null ? 'expanded' : 'half');
  };

  const setKind = (kind: RecordKind) => {
    setRecordKind(kind);
    setSurgerySelection([]);
    setBridgeSelection([]);
    if (kind !== 'tooth') setSelectedFdi(null);
    // Group kinds always need chart picking → keep the chart visible (half).
    setSheetMode(kind === 'tooth' && selectedFdi !== null ? 'expanded' : 'half');
  };

  const cancelRecording = () => {
    setSurgerySelection([]);
    setBridgeSelection([]);
    if (selectedFdi !== null && recordKind === 'tooth') {
      setView('tooth');
      setSheetMode('expanded');
    } else {
      setView('today');
      setSheetMode('collapsed');
    }
  };

  // ── Chart click dispatch ─────────────────────────────────────────────────
  const handleToothClick = (fdi: number) => {
    if (view === 'recording') {
      if (recordKind === 'surgery') {
        setSurgerySelection((p) => (p.includes(fdi) ? p.filter((f) => f !== fdi) : [...p, fdi]));
      } else if (recordKind === 'bridge') {
        setBridgeSelection((p) => (p.includes(fdi) ? p.filter((f) => f !== fdi) : [...p, fdi]));
      } else {
        // Tooth-diagnostic target chosen — now the form is usable, so expand
        // the sheet fully on mobile.
        setSelectedFdi(fdi);
        setSheetMode('expanded');
      }
      return;
    }
    goToTooth(fdi);
  };

  // ── Mutations (unchanged API contracts) ──────────────────────────────────
  const submitTooth = async (payload: {
    surfaces: Surface[];
    issue_type: IssueType;
    severity?: Severity;
    notes?: string;
    metadata?: Record<string, string>;
  }) => {
    if (selectedFdi === null) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/dental/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tooth_fdi: selectedFdi, ...payload }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as DentalResponse;
      await mutate(body, { revalidate: false });
      onToast('success', 'Intervenție salvată.');
      setView('tooth');
    } catch {
      onToast('error', 'Nu s-a putut salva intervenția.');
    }
  };

  const submitSurgery = async (payload: { tooth_fdis: number[]; comment: string }) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/dental/surgery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as DentalResponse;
      await mutate(body, { revalidate: false });
      onToast('success', 'Intervenție chirurgicală salvată.');
      setSurgerySelection([]);
      setView('today');
    } catch {
      onToast('error', 'Nu s-a putut salva intervenția.');
    }
  };

  const submitBridge = async (payload: { tooth_fdis: number[]; comment: string }) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/dental/bridges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as DentalResponse;
      await mutate(body, { revalidate: false });
      onToast('success', 'Punte salvată.');
      setBridgeSelection([]);
      setView('today');
    } catch {
      onToast('error', 'Nu s-a putut salva puntea.');
    }
  };

  const changeStatus = async (status: ToothStatus) => {
    if (selectedFdi === null) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/dental/teeth/${selectedFdi}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as DentalResponse;
      await mutate(body, { revalidate: false });
      onToast('success', 'Stare dinte actualizată.');
    } catch {
      onToast('error', 'Nu s-a putut actualiza starea dintelui.');
    }
  };

  const deleteSurgeryGroup = async (groupId: number) => {
    if (!confirm('Ștergi această intervenție chirurgicală?')) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/dental/surgery/${groupId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as DentalResponse;
      await mutate(body, { revalidate: false });
      onToast('success', 'Intervenție ștearsă.');
    } catch {
      onToast('error', 'Nu s-a putut șterge intervenția.');
    }
  };

  const deleteBridgeGroup = async (groupId: number) => {
    if (!confirm('Ștergi această punte?')) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/dental/bridges/${groupId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      const body = (await res.json()) as DentalResponse;
      await mutate(body, { revalidate: false });
      onToast('success', 'Punte ștearsă.');
    } catch {
      onToast('error', 'Nu s-a putut șterge puntea.');
    }
  };

  const surgeryActive = view === 'recording' && recordKind === 'surgery';
  const bridgeActive = view === 'recording' && recordKind === 'bridge';

  // How many affected teeth live in the *other* dentition — drives the hint
  // chip so records that aren't on the current chart stay discoverable.
  const otherDentition: Dentition = dentition === 'permanent' ? 'deciduous' : 'permanent';
  const otherDentitionCount = dental.tooth_states.filter(
    (s) => toothMatters(s) && dentitionOf(s.tooth_fdi) === otherDentition
  ).length;

  // Short label summarising what the collapsed mobile sheet contains. During
  // surgery/bridge picking it shows the running count + a hint to tap-to-finish.
  const sheetSummary =
    view === 'recording'
      ? recordKind === 'surgery'
        ? `Chirurgie · ${surgerySelection.length} aleși — apasă pentru a continua`
        : recordKind === 'bridge'
          ? `Punte · ${bridgeSelection.length} aleși — apasă pentru a continua`
          : 'Înregistrează pe dinte'
      : view === 'tooth' && selectedFdi !== null
        ? `Dinte ${selectedFdi}`
        : 'Privire de ansamblu';

  return (
    <div className={styles.tabRoot}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.dentitionGroup}>
          <div
            className={styles.dentitionToggle}
            role="tablist"
            aria-label="Tip dentiție"
          >
            {(['permanent', 'deciduous'] as Dentition[]).map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={dentition === d}
                className={`${styles.dentitionButton} ${dentition === d ? styles.dentitionButtonActive : ''}`}
                onClick={() => pickDentition(d)}
              >
                {DENTITION_LABEL_RO[d]}
              </button>
            ))}
          </div>
          {otherDentitionCount > 0 && (
            <button
              type="button"
              className={styles.dentitionHint}
              onClick={() => pickDentition(otherDentition)}
            >
              {otherDentitionCount} pe dentiția {otherDentition === 'deciduous' ? 'de copil' : 'de adult'} →
            </button>
          )}
        </div>

        <div className={styles.headerActions}>
          <Link href={`/clients/${clientId}/dental/raport`} className={styles.reportLink} prefetch>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            Raport
          </Link>
          {canEdit && (
            <button type="button" className={styles.recordCta} onClick={() => startRecording('tooth')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Înregistrează
            </button>
          )}
        </div>
      </header>

      {/* ── Main grid: chart + inspector ───────────────────────── */}
      <div className={styles.layout}>
        <div className={styles.chartColumn}>
          <Odontogram
            toothStates={dental.tooth_states}
            selectedFdi={selectedFdi}
            onSelectTooth={handleToothClick}
            surgeryGroups={dental.surgery_groups}
            surgeryMode={surgeryActive}
            surgerySelection={surgerySelection}
            onToothToggleInSurgery={(fdi) =>
              setSurgerySelection((p) => (p.includes(fdi) ? p.filter((f) => f !== fdi) : [...p, fdi]))
            }
            onSurgeryGroupClick={canEdit && view !== 'recording' ? deleteSurgeryGroup : undefined}
            bridgeGroups={dental.bridge_groups}
            bridgeMode={bridgeActive}
            bridgeSelection={bridgeSelection}
            onToothToggleInBridge={(fdi) =>
              setBridgeSelection((p) => (p.includes(fdi) ? p.filter((f) => f !== fdi) : [...p, fdi]))
            }
            onBridgeGroupClick={canEdit && view !== 'recording' ? deleteBridgeGroup : undefined}
            dentition={dentition}
            showMiniArch={false}
          />
          <IssueDistributionChart toothStates={dental.tooth_states} dentition={dentition} />
        </div>

        {/* Inspector — right column on desktop, bottom sheet on mobile */}
        <div
          className={`${styles.sheet} ${
            sheetMode === 'expanded' ? styles.sheetExpanded : sheetMode === 'half' ? styles.sheetHalf : ''
          }`}
        >
          <button
            type="button"
            className={styles.sheetHandle}
            onClick={() => setSheetMode((m) => (m === 'expanded' ? 'collapsed' : 'expanded'))}
            aria-label={sheetMode === 'expanded' ? 'Restrânge panoul' : 'Extinde panoul'}
          >
            <span className={styles.sheetGrip} aria-hidden="true" />
            <span className={styles.sheetSummary}>{sheetSummary}</span>
          </button>
          <DentalInspector
            clientId={clientId}
            canEdit={canEdit}
            dental={dental}
            view={view}
            selectedFdi={selectedFdi}
            recordKind={recordKind}
            dentition={dentition}
            surgerySelection={surgerySelection}
            bridgeSelection={bridgeSelection}
            onSelectTooth={goToTooth}
            onStartRecording={startRecording}
            onSetRecordKind={setKind}
            onCancelRecording={cancelRecording}
            onSubmitTooth={submitTooth}
            onSubmitSurgery={submitSurgery}
            onSubmitBridge={submitBridge}
            onChangeStatus={changeStatus}
            onDeleteSurgeryGroup={deleteSurgeryGroup}
            onDeleteBridgeGroup={deleteBridgeGroup}
            onDentalUpdate={(updated) => void mutate({ dental: updated }, { revalidate: false })}
            onToast={onToast}
          />
        </div>
      </div>

      {/* Mobile FAB — always-reachable record entry */}
      {canEdit && (
        <button
          type="button"
          className={`${styles.fab} ${sheetMode !== 'collapsed' ? styles.fabHidden : ''}`}
          onClick={() => startRecording('tooth')}
          aria-label="Înregistrează intervenție"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}

      {/* clientName is consumed by the dedicated /raport route, not here. */}
      {clientName ? <span hidden>{clientName}</span> : null}
    </div>
  );
}
