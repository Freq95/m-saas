'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from 'vaul';
import { useIsMobile } from '@/lib/useIsMobile';
import { useModal } from '@/lib/useModal';
import Spinner from '@/components/Spinner';
import ServicePicker from './ServicePicker';
import styles from './treatment-plans.module.css';
import modal from '../../../calendar/page.module.css';
import m from '../../../calendar/components/modals/AppointmentModal/MobileAppointmentSheet.module.css';

export type TreatmentPlanItem = {
  service_id: number | null;
  procedure: string;
  details: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type TreatmentPlan = {
  id?: number;
  doctor_user_id: number;
  plan_date: string;
  items: TreatmentPlanItem[];
  total_override: number | null;
  total: number;
  status: 'draft' | 'sent' | 'accepted';
  pdf_file_id: number | null;
  sent_at?: string | null;
  sent_to_email?: string | null;
  source_appointment_label?: string | null;
};

export type DentistOption = {
  userId: number;
  name: string;
  doctorSubtitle: string | null;
  doctorSpecialty: string | null;
};

type Service = {
  id: number;
  name: string;
  price: number | null;
};

type Props = {
  clientId: string;
  plan: TreatmentPlan;
  dentists: DentistOption[];
  canEdit: boolean;
  onSaved: (plan: TreatmentPlan, opts?: { share?: boolean }) => void;
  onCancel: () => void;
  onToast: (kind: 'success' | 'error', message: string) => void;
};

function newRow(): TreatmentPlanItem {
  return {
    service_id: null,
    procedure: '',
    details: '',
    quantity: 1,
    unit_price: 0,
    line_total: 0,
  };
}

function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(value || 0);
}

const STATUS_LABELS: Record<TreatmentPlan['status'], string> = {
  draft: 'Draft',
  sent: 'Trimis',
  accepted: 'Acceptat',
};

function IconUp() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m18 15-6-6-6 6" />
    </svg>
  );
}

function IconDown() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4h6v2" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** lower-case + strip diacritics so "consultaţie" matches "cons". */
function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** One procedure rendered as an iOS-style expandable row, matching the
 *  appointment sheet's service section (m.row → m.expanded → m.option). */
function MobileProcedureItem({
  item, index, total, services, disabled, isOpen, onToggle,
  onPick, onText, onQuantity, onCost, onDetails, onMove, onRemove,
}: {
  item: TreatmentPlanItem;
  index: number;
  total: number;
  services: Service[];
  disabled: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onPick: (service: Service) => void;
  onText: (text: string) => void;
  onQuantity: (n: number) => void;
  onCost: (n: number) => void;
  onDetails: (text: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const sorted = [...services].sort((a, b) => normalizeSearch(a.name).localeCompare(normalizeSearch(b.name), 'ro'));
    const q = normalizeSearch(query);
    return (q ? sorted.filter((s) => normalizeSearch(s.name).includes(q)) : sorted).slice(0, 24);
  }, [services, query]);
  const hasName = item.procedure.trim().length > 0;

  return (
    <div className={m.section}>
      <button type="button" className={m.row} onClick={onToggle} disabled={disabled}>
        <span className={`${m.rowIcon} ${styles.mobileProcNum}`}>{index + 1}</span>
        <div className={m.rowMain}>
          <div className={`${m.rowLabel} ${hasName ? '' : m.rowLabelMuted}`}>
            {hasName ? item.procedure.trim() : 'Procedură nouă'}
          </div>
          <div className={m.rowValue}>{item.quantity} buc · {formatMoney(Number(item.line_total || 0))} lei</div>
        </div>
        {!disabled && (
          <span className={`${m.rowChevron} ${isOpen ? m.rowChevronOpen : ''}`}><IconChevron /></span>
        )}
      </button>
      {isOpen && !disabled && (
        <div className={m.expanded}>
          <input
            type="text"
            className={m.serviceSearch}
            value={query}
            placeholder="Caută serviciu sau scrie liber…"
            onChange={(event) => { setQuery(event.target.value); onText(event.target.value); }}
            aria-label="Caută serviciu"
          />
          {matches.map((service) => (
            <button
              key={service.id}
              type="button"
              className={`${m.option} ${item.procedure === service.name ? m.optionSelected : ''}`}
              onClick={() => { onPick(service); setQuery(''); }}
            >
              <span>{service.name}</span>
              {typeof service.price === 'number' && service.price > 0 && (
                <span className={m.optionMeta}>{service.price} lei</span>
              )}
            </button>
          ))}
          <div className={m.recurrenceGrid}>
            <div className={m.recurrenceField}>
              <span className={m.recurrenceFieldLabel}>Cantitate</span>
              <input
                className={m.recurrenceInput}
                type="number" min={1} step="0.5" inputMode="decimal"
                value={item.quantity}
                onChange={(event) => onQuantity(Number(event.target.value))}
                aria-label="Cantitate"
              />
            </div>
            <div className={m.recurrenceField}>
              <span className={m.recurrenceFieldLabel}>Cost (lei)</span>
              <input
                className={m.recurrenceInput}
                type="number" min={0} step="1" inputMode="decimal"
                value={item.line_total}
                onChange={(event) => onCost(Number(event.target.value))}
                aria-label="Cost"
              />
            </div>
          </div>
          <div className={m.recurrenceField} style={{ marginTop: '0.65rem' }}>
            <span className={m.recurrenceFieldLabel}>Detalii (opțional)</span>
            <input
              className={m.recurrenceInput}
              type="text"
              value={item.details}
              placeholder="Note pentru această procedură"
              onChange={(event) => onDetails(event.target.value)}
              aria-label="Detalii"
            />
          </div>
          <div className={styles.mobileProcActions}>
            <button type="button" onClick={() => onMove(-1)} disabled={index === 0}><IconUp /> Sus</button>
            <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}><IconDown /> Jos</button>
            <button type="button" className={styles.mobileProcDelete} onClick={onRemove}><IconTrash /> Șterge</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlanBuilder({
  clientId,
  plan,
  dentists,
  canEdit,
  onSaved,
  onCancel,
  onToast,
}: Props) {
  const [doctorUserId, setDoctorUserId] = useState(plan.doctor_user_id || dentists[0]?.userId || 0);
  const [planDate, setPlanDate] = useState(plan.plan_date || new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<TreatmentPlanItem[]>(plan.items.length > 0 ? plan.items : [newRow()]);
  const [totalOverride, setTotalOverride] = useState(plan.total_override === null ? '' : String(plan.total_override));
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  // Mobile-sheet UI state: which procedure row is expanded, and the medic picker.
  const [openProcedure, setOpenProcedure] = useState<number | null>(0);
  const [medicOpen, setMedicOpen] = useState(false);
  const onToastRef = useRef(onToast);
  const readOnly = !canEdit || plan.status !== 'draft';

  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  useEffect(() => {
    setDoctorUserId(plan.doctor_user_id || dentists[0]?.userId || 0);
    setPlanDate(plan.plan_date || new Date().toISOString().slice(0, 10));
    setItems(plan.items.length > 0 ? plan.items : [newRow()]);
    setTotalOverride(plan.total_override === null ? '' : String(plan.total_override));
    setOpenProcedure(0);
    setMedicOpen(false);
  }, [dentists, plan]);

  useEffect(() => {
    if (!doctorUserId) return;
    let alive = true;
    fetch(`/api/services?dentistUserId=${doctorUserId}`)
      .then((response) => response.json().then((data) => ({ response, data })))
      .then(({ response, data }) => {
        if (!alive) return;
        if (!response.ok) throw new Error(data.error || 'Nu am putut incarca serviciile.');
        setServices(data.services || []);
      })
      .catch((error) => {
        if (alive) onToastRef.current('error', error instanceof Error ? error.message : 'Nu am putut incarca serviciile.');
      });
    return () => { alive = false; };
  }, [doctorUserId]);

  const recap = useMemo(() => {
    const byProcedure = new Map<string, number>();
    for (const item of items) {
      if (!item.procedure.trim()) continue;
      byProcedure.set(item.procedure.trim(), roundMoney((byProcedure.get(item.procedure.trim()) || 0) + Number(item.line_total || 0)));
    }
    return Array.from(byProcedure.entries()).map(([label, amount]) => ({ label, amount }));
  }, [items]);

  const computedTotal = useMemo(
    () => roundMoney(items.reduce((sum, item) => sum + Number(item.line_total || 0), 0)),
    [items]
  );
  const finalTotal = totalOverride.trim() === '' ? computedTotal : roundMoney(Number(totalOverride));

  function updateItem(index: number, patch: Partial<TreatmentPlanItem>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function pickService(index: number, service: Service) {
    const quantity = Number(items[index]?.quantity || 1);
    const unit = Number(service.price || 0);
    updateItem(index, {
      service_id: service.id,
      procedure: service.name,
      unit_price: unit,
      line_total: roundMoney(quantity * unit),
    });
  }

  function setProcedureText(index: number, value: string) {
    updateItem(index, { procedure: value, service_id: null });
  }

  function updateQuantity(index: number, quantity: number) {
    const item = items[index];
    updateItem(index, {
      quantity,
      line_total: roundMoney(quantity * Number(item.unit_price || 0)),
    });
  }

  function moveRow(index: number, direction: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save(options?: { share?: boolean }) {
    if (!doctorUserId) {
      onToast('error', 'Alege medicul care semneaza planul.');
      return;
    }
    const cleanItems = items
      .map((item) => ({
        ...item,
        procedure: item.procedure.trim(),
        details: item.details.trim(),
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.unit_price || 0),
        line_total: Number(item.line_total || 0),
      }))
      .filter((item) => item.procedure.length > 0);
    if (cleanItems.length === 0) {
      onToast('error', 'Adauga cel putin o procedura.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        doctor_user_id: doctorUserId,
        plan_date: planDate,
        items: cleanItems,
        total_override: totalOverride.trim() === '' ? null : Number(totalOverride),
      };
      const url = plan.id
        ? `/api/clients/${clientId}/treatment-plans/${plan.id}`
        : `/api/clients/${clientId}/treatment-plans`;
      const response = await fetch(url, {
        method: plan.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.plan) throw new Error(data.error || 'Nu am putut salva planul.');
      onSaved(data.plan, options);
      if (!options?.share) onToast('success', 'Planul de tratament a fost salvat.');
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : 'Nu am putut salva planul.');
    } finally {
      setSaving(false);
    }
  }

  const isMobile = useIsMobile();
  const title = plan.id ? `Plan #${plan.id}` : 'Plan nou';
  const { overlayProps, dialogProps } = useModal({ isOpen: true, onClose: onCancel, closeDisabled: saving });
  const statusPill = (
    <span className={`${styles.status} ${styles[`status_${plan.status}`]}`}>{STATUS_LABELS[plan.status]}</span>
  );

  const body = (
    <div className={styles.builderBody}>
      {readOnly && (
        <p className={styles.readOnlyNote}>
          Plan {STATUS_LABELS[plan.status].toLowerCase()} — blocat pentru editare. Duplică-l pentru o revizie nouă.
        </p>
      )}

      {!plan.id && plan.source_appointment_label && (
        <p className={styles.sourceNote}>{plan.source_appointment_label}</p>
      )}

      <div className={styles.builderGrid}>
        <label className={styles.field}>
          <span>Data</span>
          <input type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} disabled={readOnly || saving} />
        </label>
        <label className={styles.field}>
          <span>Medic</span>
          <select value={doctorUserId} onChange={(event) => setDoctorUserId(Number(event.target.value))} disabled={readOnly || saving}>
            {dentists.map((dentist) => (
              <option key={dentist.userId} value={dentist.userId}>{dentist.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.itemsHeader}>
        <span>Proceduri</span>
        {!readOnly && (
          <button type="button" className={styles.secondaryButton} onClick={() => setItems((prev) => [...prev, newRow()])} disabled={saving}>
            + Rand
          </button>
        )}
      </div>

      <div className={styles.itemList}>
        <div className={styles.itemListHeader}>
          <span>Serviciu</span>
          <span>Cant.</span>
          <span>Cost (lei)</span>
          <span></span>
        </div>
        {items.map((item, index) => (
          <div key={index} className={styles.itemRow}>
            <div className={styles.itemMain}>
              <ServicePicker
                value={item.procedure}
                services={services}
                disabled={readOnly || saving}
                onPick={(service) => pickService(index, service)}
                onText={(text) => setProcedureText(index, text)}
              />
            </div>
            <label className={styles.cellField}>
              <span>Cant.</span>
              <input
                className={styles.cellInput}
                type="number"
                min={1}
                step="0.5"
                value={item.quantity}
                placeholder="Cant."
                aria-label="Cantitate"
                onChange={(event) => updateQuantity(index, Number(event.target.value))}
                disabled={readOnly || saving}
              />
            </label>
            <label className={styles.cellField}>
              <span>Cost</span>
              <input
                className={`${styles.cellInput} ${styles.cellRight}`}
                type="number"
                min={0}
                step="1"
                value={item.line_total}
                placeholder="Cost"
                aria-label="Cost"
                onChange={(event) => updateItem(index, { line_total: Number(event.target.value) })}
                disabled={readOnly || saving}
              />
            </label>
            {!readOnly && (
              <div className={styles.rowActions}>
                <button type="button" className={styles.actionIcon} onClick={() => moveRow(index, -1)} disabled={index === 0 || saving} aria-label="Muta mai sus" data-tooltip="Muta sus"><IconUp /></button>
                <button type="button" className={styles.actionIcon} onClick={() => moveRow(index, 1)} disabled={index === items.length - 1 || saving} aria-label="Muta mai jos" data-tooltip="Muta jos"><IconDown /></button>
                <button type="button" className={`${styles.actionIcon} ${styles.dangerAction}`} onClick={() => setItems((prev) => prev.length === 1 ? [newRow()] : prev.filter((_, i) => i !== index))} disabled={saving} aria-label="Sterge randul" data-tooltip="Sterge"><IconTrash /></button>
              </div>
            )}
            <input
              className={styles.detailsInput}
              value={item.details}
              placeholder="Detalii (opțional)…"
              aria-label="Detalii"
              onChange={(event) => updateItem(index, { details: event.target.value })}
              disabled={readOnly || saving}
            />
          </div>
        ))}
      </div>

      <div className={styles.summaryGrid}>
        <div className={styles.recap}>
          <h4>Recapitulare</h4>
          {recap.length === 0 ? (
            <span className={styles.muted}>Nu exista proceduri.</span>
          ) : recap.map((line) => (
            <div key={line.label} className={styles.recapLine}>
              <span>{line.label}</span>
              <strong>{formatMoney(line.amount)} lei</strong>
            </div>
          ))}
        </div>
        <div className={styles.totalBox}>
          <span>Total calculat: {formatMoney(computedTotal)} lei</span>
          <label className={styles.field}>
            <span>Total override</span>
            <input type="number" min={0} step="0.01" value={totalOverride} onChange={(event) => setTotalOverride(event.target.value)} disabled={readOnly || saving} placeholder="Optional" />
          </label>
          <strong>Total general: {formatMoney(finalTotal)} lei</strong>
        </div>
      </div>

    </div>
  );

  // ── Mobile: vaul bottom sheet (mirrors the appointment modal on phones) ──
  if (isMobile) {
    return (
      <Drawer.Root
        open
        onOpenChange={(open) => { if (!open && !saving) onCancel(); }}
        direction="bottom"
        handleOnly
        closeThreshold={0.28}
        dismissible={!saving}
      >
        <Drawer.Portal>
          <Drawer.Overlay className={m.overlay} />
          <Drawer.Content className={m.sheet} aria-label={title}>
            <div className={m.topBar}>
              <button type="button" className={`${m.actionBtn} ${m.actionBtnLeft}`} onClick={onCancel} disabled={saving}>
                {readOnly ? 'Închide' : 'Anulează'}
              </button>
              <div className={m.topBarCenter}>
                <Drawer.Handle className={m.dragHandle} />
                <Drawer.Title className={m.topBarTitle}>{title}</Drawer.Title>
              </div>
              {readOnly ? (
                <span aria-hidden style={{ width: 64 }} />
              ) : (
                <button type="button" className={`${m.actionBtn} ${m.actionBtnPrimary}`} onClick={() => save({ share: true })} disabled={saving}>
                  {saving ? <Spinner size={14} thickness={2} centered={false} label="Salvare" /> : 'Salveaza + trimite'}
                </button>
              )}
            </div>
            <div className={m.body}>
              {readOnly && (
                <div className={m.banner}>
                  <span className={m.bannerIcon} aria-hidden>🔒</span>
                  Plan {STATUS_LABELS[plan.status].toLowerCase()} — blocat pentru editare. Duplică-l pentru o revizie nouă.
                </div>
              )}
              {!plan.id && plan.source_appointment_label && (
                <div className={m.banner}>
                  <span className={m.bannerIcon} aria-hidden>↩</span>
                  {plan.source_appointment_label}
                </div>
              )}

              {/* ── Detaliile planului ── */}
              <div className={m.section}>
                <div className={m.timeBlock}>
                  <span className={m.rowIcon}><IconCalendar /></span>
                  <div className={m.timeBlockMain}>
                    <div className={m.timeBlockGroup}>
                      <span className={m.timeBlockLabel}>Data</span>
                      <span className={m.timeBlockValueArea}>
                        <input
                          type="date"
                          className={m.nativeDateInput}
                          value={planDate}
                          onChange={(event) => setPlanDate(event.target.value)}
                          disabled={readOnly || saving}
                        />
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={m.section}>
                <button
                  type="button"
                  className={m.row}
                  onClick={() => !readOnly && setMedicOpen((open) => !open)}
                  disabled={readOnly}
                >
                  <span className={m.rowIcon}><IconUser /></span>
                  <div className={m.rowMain}>
                    <div className={m.rowLabel}>Medic</div>
                    <div className={m.rowValue}>
                      {dentists.find((d) => d.userId === doctorUserId)?.name || 'Selectează medicul'}
                    </div>
                  </div>
                  {!readOnly && (
                    <span className={`${m.rowChevron} ${medicOpen ? m.rowChevronOpen : ''}`}><IconChevron /></span>
                  )}
                </button>
                {medicOpen && !readOnly && (
                  <div className={m.expanded}>
                    {dentists.map((dentist) => (
                      <button
                        key={dentist.userId}
                        type="button"
                        className={`${m.option} ${dentist.userId === doctorUserId ? m.optionSelected : ''}`}
                        onClick={() => { setDoctorUserId(dentist.userId); setMedicOpen(false); }}
                      >
                        <span>{dentist.name}</span>
                        {dentist.doctorSpecialty && <span className={m.optionMeta}>{dentist.doctorSpecialty}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Proceduri ── */}
              <div className={styles.mobileSectionTitle}>Proceduri</div>
              {items.map((item, index) => (
                <MobileProcedureItem
                  key={index}
                  item={item}
                  index={index}
                  total={items.length}
                  services={services}
                  disabled={readOnly || saving}
                  isOpen={openProcedure === index}
                  onToggle={() => setOpenProcedure((current) => (current === index ? null : index))}
                  onPick={(service) => pickService(index, service)}
                  onText={(text) => setProcedureText(index, text)}
                  onQuantity={(n) => updateQuantity(index, n)}
                  onCost={(n) => updateItem(index, { line_total: n })}
                  onDetails={(text) => updateItem(index, { details: text })}
                  onMove={(dir) => moveRow(index, dir)}
                  onRemove={() => {
                    setItems((prev) => (prev.length === 1 ? [newRow()] : prev.filter((_, i) => i !== index)));
                    setOpenProcedure(null);
                  }}
                />
              ))}
              {!readOnly && (
                <div className={m.section}>
                  <button
                    type="button"
                    className={m.row}
                    onClick={() => { setItems((prev) => [...prev, newRow()]); setOpenProcedure(items.length); }}
                    disabled={saving}
                  >
                    <span className={m.rowIcon}><IconPlus /></span>
                    <div className={m.rowMain}>
                      <div className={`${m.rowLabel} ${styles.mobileAddLabel}`}>Adaugă procedură</div>
                    </div>
                  </button>
                </div>
              )}

              {/* ── Total ── */}
              <div className={styles.mobileSectionTitle}>Total</div>
              <div className={m.section}>
                <div className={`${m.row} ${m.rowStatic}`}>
                  <span className={m.rowIcon} aria-hidden />
                  <div className={m.rowMain}><div className={m.rowLabel}>Total calculat</div></div>
                  <span className={m.rowTrailing}>{formatMoney(computedTotal)} lei</span>
                </div>
                <div className={m.inputRowWithLabel}>
                  <span className={m.rowIcon} aria-hidden />
                  <div className={m.inputRowMain}>
                    <span className={m.inputRowLabel}>Total manual (opțional)</span>
                    <input
                      className={m.inputBare}
                      type="number" min={0} step="0.01" inputMode="decimal"
                      value={totalOverride}
                      placeholder="Lasă gol pentru totalul calculat"
                      onChange={(event) => setTotalOverride(event.target.value)}
                      disabled={readOnly || saving}
                    />
                  </div>
                </div>
                <div className={`${m.row} ${m.rowStatic}`}>
                  <span className={m.rowIcon} aria-hidden />
                  <div className={m.rowMain}><div className={m.rowLabel}>Total general</div></div>
                  <span className={`${m.rowTrailing} ${styles.mobileTotalValue}`}>{formatMoney(finalTotal)} lei</span>
                </div>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  // ── Desktop: centered dialog (mirrors the appointment modal) ──
  return (
    <div className={modal.modalOverlay} {...overlayProps}>
      <div
        className={`${modal.modal} ${modal.modalWide}`}
        {...dialogProps}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={modal.modalHeader}>
          <h3>{title}</h3>
          <div className={modal.modalHeaderActions}>
            {statusPill}
            <button type="button" className={modal.closeButton} onClick={onCancel} aria-label="Inchide" data-tooltip="Inchide" disabled={saving}>
              ×
            </button>
          </div>
        </div>
        {body}
        {!readOnly && (
          <div className={modal.modalActions}>
            <button type="button" className={modal.saveButton} onClick={() => save({ share: true })} disabled={saving}>
              {saving ? (
                <>
                  <Spinner size={14} thickness={2} centered={false} label="Se salveaza" />
                  <span>Se salveaza</span>
                </>
              ) : 'Salveaza + trimite'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
