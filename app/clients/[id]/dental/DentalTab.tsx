'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Drawer } from 'vaul';
import { useIsMobile } from '@/lib/useIsMobile';
import { authFetcher } from '@/lib/fetcher';
import m from '../../../calendar/components/modals/AppointmentModal/MobileAppointmentSheet.module.css';
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
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  // 860 matches the dental layout's mobile breakpoint (chart stacks, modal opens).
  const isMobile = useIsMobile(860);
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
    } else {
      setSelectedFdi(fdi);
      setView('tooth');
    }
  };

  const startRecording = (kind: RecordKind) => {
    setFabMenuOpen(false);
    setRecordKind(kind);
    setSurgerySelection([]);
    setBridgeSelection([]);
    if (kind !== 'tooth') setSelectedFdi(null);
    setView('recording');
  };

  const setKind = (kind: RecordKind) => {
    setRecordKind(kind);
    setSurgerySelection([]);
    setBridgeSelection([]);
    if (kind !== 'tooth') setSelectedFdi(null);
  };

  const cancelRecording = () => {
    setSurgerySelection([]);
    setBridgeSelection([]);
    if (selectedFdi !== null && recordKind === 'tooth') {
      setView('tooth');
    } else {
      setView('today');
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
        // Tooth-diagnostic target chosen → the record modal opens with the form.
        setSelectedFdi(fdi);
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

  const inspectorProps = {
    clientId,
    canEdit,
    dental,
    selectedFdi,
    recordKind,
    dentition,
    surgerySelection,
    bridgeSelection,
    onSelectTooth: goToTooth,
    onStartRecording: startRecording,
    onSetRecordKind: setKind,
    onCancelRecording: cancelRecording,
    onSubmitTooth: submitTooth,
    onSubmitSurgery: submitSurgery,
    onSubmitBridge: submitBridge,
    onChangeStatus: changeStatus,
    onDeleteSurgeryGroup: deleteSurgeryGroup,
    onDeleteBridgeGroup: deleteBridgeGroup,
    onDentalUpdate: (updated: DentalData) => void mutate({ dental: updated }, { revalidate: false }),
    onToast,
  };

  // Phone: a single tooth (view or record) opens a full-screen modal; surgery
  // and bridge keep the chart for multi-tooth picking with a bottom panel.
  const toothModalOpen = isMobile && selectedFdi !== null
    && (view === 'tooth' || (view === 'recording' && recordKind === 'tooth'));
  const groupRecording = view === 'recording' && (recordKind === 'surgery' || recordKind === 'bridge');
  const toothRecordPrompt = isMobile && view === 'recording' && recordKind === 'tooth' && selectedFdi === null;
  const closeToothModal = () => { if (view === 'recording') cancelRecording(); else goToTooth(null); };

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

          {/* Mobile: overview as a normal card (not a floating sheet). */}
          {isMobile && (
            <div className={styles.overviewCard}>
              <DentalInspector {...inspectorProps} view="today" />
            </div>
          )}
        </div>

        {/* Desktop: inspector as the sticky right column. */}
        {!isMobile && (
          <div className={styles.sheet}>
            <DentalInspector {...inspectorProps} view={view} />
          </div>
        )}
      </div>

      {/* Mobile: single tooth (view or record) opens a full-screen modal. */}
      {isMobile && (
        <Drawer.Root
          open={toothModalOpen}
          onOpenChange={(open) => { if (!open && toothModalOpen) closeToothModal(); }}
          direction="bottom"
          handleOnly
          dismissible
        >
          <Drawer.Portal>
            <Drawer.Overlay className={m.overlay} />
            <Drawer.Content className={m.sheet} aria-label={view === 'recording' ? `Intervenție · Dinte ${selectedFdi ?? ''}` : `Dinte ${selectedFdi ?? ''}`}>
              <div className={m.topBar}>
                <button type="button" className={`${m.actionBtn} ${m.actionBtnLeft}`} onClick={closeToothModal}>
                  {view === 'recording' ? 'Anulează' : 'Închide'}
                </button>
                <div className={m.topBarCenter}>
                  <Drawer.Handle className={m.dragHandle} />
                  <Drawer.Title className={m.topBarTitle}>
                    {view === 'recording' ? `Intervenție · Dinte ${selectedFdi ?? ''}` : `Dinte ${selectedFdi ?? ''}`}
                  </Drawer.Title>
                </div>
                <span aria-hidden style={{ width: 56 }} />
              </div>
              <div className={`${m.body} ${styles.modalBody}`}>
                <DentalInspector {...inspectorProps} view={view} chromeless />
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}

      {/* Mobile: surgery/bridge keep the chart for picking; form sits in a panel. */}
      {isMobile && groupRecording && (
        <div className={styles.groupPanel}>
          <DentalInspector {...inspectorProps} view="recording" />
        </div>
      )}

      {/* Mobile: prompt to tap a tooth when recording a single tooth. */}
      {toothRecordPrompt && (
        <div className={styles.recordHintBar}>
          <span>Apasă pe un dinte pentru a înregistra</span>
          <button type="button" onClick={cancelRecording}>Anulează</button>
        </div>
      )}

      {/* Mobile FAB → record-kind chooser. */}
      {isMobile && canEdit && view !== 'recording' && !toothModalOpen && (
        <>
          {fabMenuOpen && (
            <>
              <div className={styles.fabScrim} onClick={() => setFabMenuOpen(false)} aria-hidden="true" />
              <div className={styles.fabMenu} role="menu" aria-label="Tip înregistrare">
                <button type="button" role="menuitem" onClick={() => startRecording('tooth')}>Diagnostic pe dinte</button>
                <button type="button" role="menuitem" onClick={() => startRecording('surgery')}>Chirurgie</button>
                <button type="button" role="menuitem" onClick={() => startRecording('bridge')}>Punte</button>
              </div>
            </>
          )}
          <button
            type="button"
            className={`${styles.fab} ${fabMenuOpen ? styles.fabOpen : ''}`}
            onClick={() => setFabMenuOpen((o) => !o)}
            aria-label="Înregistrează intervenție"
            aria-expanded={fabMenuOpen}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </>
      )}

      {/* clientName is consumed by the dedicated /raport route, not here. */}
      {clientName ? <span hidden>{clientName}</span> : null}
    </div>
  );
}
