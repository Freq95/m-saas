'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PlanBuilder, { type DentistOption, type TreatmentPlan } from './PlanBuilder';
import styles from './treatment-plans.module.css';

type ClientInfo = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
};

type Props = {
  clientId: string;
  canEdit: boolean;
  clientName?: string;
  clientEmail?: string | null;
  clientPhone?: string | null;
  onToast: (kind: 'success' | 'error', message: string) => void;
  onFilesChanged?: () => void;
};

type ShareSheet = {
  plan: TreatmentPlan;
  loading: boolean;
  url: string | null;
  token: string | null;
  expiresAt: string | null;
  whatsappReady: boolean;
  copied: boolean;
  emailMode: boolean;
  to: string;
  message: string;
  attachPdf: boolean;
};

function formatMoney(value: number, currency = 'lei'): string {
  return `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(value || 0)} ${currency}`;
}

function formatExpiry(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

const STATUS_LABELS: Record<TreatmentPlan['status'], string> = {
  draft: 'Draft',
  sent: 'Trimis',
  accepted: 'Acceptat',
};

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconOpen() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function IconWhatsApp() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35zM12.02 21.5h-.01a9.5 9.5 0 0 1-4.84-1.32l-.35-.21-3.6.94.96-3.51-.23-.36a9.45 9.45 0 0 1-1.45-5.04c0-5.23 4.26-9.49 9.5-9.49 2.54 0 4.92.99 6.71 2.78a9.43 9.43 0 0 1 2.78 6.72c0 5.23-4.26 9.49-9.49 9.49zm8.08-17.58A11.36 11.36 0 0 0 12.02.6C5.74.6.62 5.72.62 12c0 2.01.53 3.97 1.53 5.7L.53 23.4l5.84-1.53a11.38 11.38 0 0 0 5.65 1.44h.01c6.28 0 11.4-5.12 11.4-11.4 0-3.05-1.19-5.91-3.33-8.06z" />
    </svg>
  );
}

function IconLink() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4h6v2" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function emptyPlan(dentists: DentistOption[]): TreatmentPlan {
  return {
    doctor_user_id: dentists[0]?.userId || 0,
    plan_date: new Date().toISOString().slice(0, 10),
    items: [],
    total_override: null,
    total: 0,
    status: 'draft',
    pdf_file_id: null,
  };
}

export default function TreatmentPlansTab({
  clientId,
  canEdit,
  clientName,
  clientEmail,
  clientPhone,
  onToast,
  onFilesChanged,
}: Props) {
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [dentists, setDentists] = useState<DentistOption[]>([]);
  const [client, setClient] = useState<ClientInfo | null>(
    clientName ? { id: Number(clientId), name: clientName, email: clientEmail || null, phone: clientPhone || null } : null
  );
  const [selectedPlan, setSelectedPlan] = useState<TreatmentPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [share, setShare] = useState<ShareSheet | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/treatment-plans`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nu am putut incarca planurile.');
      setPlans(data.plans || []);
      setDentists(data.dentists || []);
      if (data.client) setClient(data.client);
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : 'Nu am putut incarca planurile.');
    } finally {
      setLoading(false);
    }
  }, [clientId, onToast]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => (b.id || 0) - (a.id || 0)), [plans]);

  // Update the list only — callers decide whether the builder should open/close.
  // (Previously this force-opened the builder on every save/share/PDF, which
  // kept the editor open after saving and flashed it behind the share sheet.)
  function upsertPlan(plan: TreatmentPlan) {
    setPlans((prev) => {
      const exists = prev.some((candidate) => candidate.id === plan.id);
      return exists
        ? prev.map((candidate) => candidate.id === plan.id ? plan : candidate)
        : [plan, ...prev];
    });
  }

  async function generatePdf(plan: TreatmentPlan) {
    if (!plan.id) return;
    setBusyId(plan.id);
    try {
      const response = await fetch(`/api/clients/${clientId}/treatment-plans/${plan.id}/pdf`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nu am putut genera PDF-ul.');
      upsertPlan(data.plan);
      onFilesChanged?.();
      onToast('success', 'PDF-ul a fost generat si salvat la fisiere.');
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : 'Nu am putut genera PDF-ul.');
    } finally {
      setBusyId(null);
    }
  }

  // ── Share ──────────────────────────────────────────────────────────────
  async function openShareSheet(plan: TreatmentPlan) {
    if (!plan.id) return;
    setShare({
      plan,
      loading: true,
      url: null,
      token: null,
      expiresAt: null,
      whatsappReady: false,
      copied: false,
      emailMode: false,
      to: client?.email || '',
      message: '',
      attachPdf: false,
    });
    try {
      const response = await fetch(`/api/clients/${clientId}/treatment-plans/${plan.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nu am putut pregati linkul.');
      setShare((prev) => prev && prev.plan.id === plan.id ? {
        ...prev,
        loading: false,
        url: data.url ?? null,
        token: data.token ?? null,
        expiresAt: data.expiresAt ?? null,
        whatsappReady: Boolean(data.patient?.whatsappReady),
        to: prev.to || data.patient?.email || '',
      } : prev);
      onFilesChanged?.(); // the share endpoint generates the PDF on first use
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : 'Nu am putut pregati linkul.');
      setShare(null);
    }
  }

  async function shareWhatsApp() {
    if (!share?.plan.id) return;
    // Open the tab synchronously (within the click) to dodge popup blockers,
    // then point it at the wa.me URL once the server confirms the link.
    const win = window.open('', '_blank');
    setShareBusy(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/treatment-plans/${share.plan.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'whatsapp', token: share.token || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nu am putut deschide WhatsApp.');
      if (data.plan) upsertPlan(data.plan);
      if (win) {
        // Point the pre-opened tab at WhatsApp (never navigate the app itself).
        win.location.href = data.waUrl;
        onToast('success', 'Planul a fost marcat ca trimis pe WhatsApp.');
        setShare(null);
      } else {
        onToast('error', 'Permite ferestrele pop-up sau folosește „Copiază linkul”.');
      }
    } catch (error) {
      if (win) win.close();
      onToast('error', error instanceof Error ? error.message : 'Nu am putut deschide WhatsApp.');
    } finally {
      setShareBusy(false);
    }
  }

  async function copyShareLink() {
    if (!share?.url) return;
    try {
      await navigator.clipboard.writeText(share.url);
      setShare((prev) => prev ? { ...prev, copied: true } : prev);
      onToast('success', 'Link copiat in clipboard.');
    } catch {
      onToast('error', 'Nu am putut copia linkul.');
    }
  }

  async function sendShareEmail() {
    if (!share?.plan.id) return;
    setShareBusy(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/treatment-plans/${share.plan.id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: share.to.trim() || undefined,
          message: share.message.trim() || undefined,
          attachPdf: share.attachPdf,
          token: share.token || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nu am putut trimite emailul.');
      upsertPlan(data.plan);
      onToast('success', 'Planul a fost trimis pe email.');
      setShare(null);
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : 'Nu am putut trimite emailul.');
    } finally {
      setShareBusy(false);
    }
  }

  function duplicatePlan(plan: TreatmentPlan) {
    setSelectedPlan({
      doctor_user_id: plan.doctor_user_id,
      plan_date: new Date().toISOString().slice(0, 10),
      items: plan.items.map((item) => ({ ...item })),
      total_override: plan.total_override,
      total: plan.total,
      status: 'draft',
      pdf_file_id: null,
    });
  }

  async function deletePlan(plan: TreatmentPlan) {
    if (!plan.id || !window.confirm('Stergi acest plan de tratament?')) return;
    setBusyId(plan.id);
    try {
      const response = await fetch(`/api/clients/${clientId}/treatment-plans/${plan.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nu am putut sterge planul.');
      setPlans((prev) => prev.filter((candidate) => candidate.id !== plan.id));
      if (selectedPlan?.id === plan.id) setSelectedPlan(null);
      onFilesChanged?.();
      onToast('success', 'Planul a fost sters.');
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : 'Nu am putut sterge planul.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className={styles.loading}>Se incarca planurile...</div>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div>
          <span className={styles.kicker}>Fișă pacient</span>
          <h3>Planuri de tratament</h3>
          <span>{client?.name || clientName || 'Pacient'}</span>
        </div>
        {canEdit && (
          <button type="button" className={styles.primaryButton} onClick={() => setSelectedPlan(emptyPlan(dentists))}>
            <IconPlus />
            <span>Plan nou</span>
          </button>
        )}
      </div>

      {selectedPlan && (
        <PlanBuilder
          clientId={clientId}
          plan={selectedPlan}
          dentists={dentists}
          canEdit={canEdit}
          onSaved={(plan, opts) => {
            upsertPlan(plan);
            setSelectedPlan(null);
            if (opts?.share) void openShareSheet(plan);
          }}
          onCancel={() => setSelectedPlan(null)}
          onToast={onToast}
        />
      )}

      {sortedPlans.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}><IconFile /></span>
          <strong>Niciun plan de tratament</strong>
          <p>Creează primul plan pentru {client?.name || clientName || 'acest pacient'} — adaugă proceduri, generează PDF-ul și trimite-l pe WhatsApp sau email.</p>
          {canEdit && (
            <button className={styles.primaryButton} onClick={() => setSelectedPlan(emptyPlan(dentists))}>
              <IconPlus />
              <span>Plan nou</span>
            </button>
          )}
        </div>
      ) : (
        <div className={styles.planList}>
          <div className={styles.listHeader}>
            <span>Data</span>
            <span>Plan</span>
            <span>Status</span>
            <span>Actiuni</span>
          </div>
          {sortedPlans.map((plan) => {
            const dentistName = dentists.find((dentist) => dentist.userId === plan.doctor_user_id)?.name;
            return (
            <div key={plan.id} className={styles.planRow}>
              <time className={styles.planDate}>{plan.plan_date}</time>
              <div className={styles.planMain}>
                <strong>Plan #{plan.id}{dentistName ? ` · ${dentistName}` : ''}</strong>
                <span>{formatMoney(plan.total)} · {plan.items.length} proceduri</span>
                {plan.sent_to_email && <span>Trimis către {plan.sent_to_email}</span>}
              </div>
              <span className={`${styles.status} ${styles[`status_${plan.status}`]}`}>{STATUS_LABELS[plan.status]}</span>
              <div className={styles.actions}>
                <button type="button" className={styles.actionIcon} onClick={() => setSelectedPlan(plan)} title="Deschide" aria-label="Deschide planul">
                  <IconOpen />
                </button>
                {canEdit && (
                  <button type="button" className={styles.actionIcon} onClick={() => openShareSheet(plan)} disabled={busyId === plan.id} title="Trimite" aria-label="Trimite planul">
                    <IconSend />
                  </button>
                )}
                <details className={styles.moreMenu}>
                  <summary className={styles.actionIcon} title="Mai mult" aria-label="Mai multe actiuni">
                    <IconMore />
                  </summary>
                  <div onClick={(event) => (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open')}>
                    {canEdit && <button type="button" onClick={() => generatePdf(plan)} disabled={busyId === plan.id}><IconFile /> Genereaza PDF</button>}
                    {plan.pdf_file_id && <a href={`/api/clients/${clientId}/files/${plan.pdf_file_id}/preview`} target="_blank"><IconEye /> Preview / print</a>}
                    {plan.pdf_file_id && <a href={`/api/clients/${clientId}/files/${plan.pdf_file_id}/download`} target="_blank"><IconDownload /> Descarca</a>}
                    {canEdit && <button type="button" onClick={() => duplicatePlan(plan)}><IconCopy /> Duplica</button>}
                    {canEdit && <button type="button" className={styles.dangerAction} onClick={() => deletePlan(plan)} disabled={busyId === plan.id}><IconTrash /> Sterge</button>}
                  </div>
                </details>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {share && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !shareBusy) setShare(null);
        }}>
          <div className={styles.shareSheet} role="dialog" aria-modal="true" aria-labelledby="share-plan-title">
            <div className={styles.sheetHandle} />
            <div className={styles.modalHeader}>
              <div>
                <h3 id="share-plan-title">Trimite planul</h3>
                <span>Plan #{share.plan.id} · {formatMoney(share.plan.total)}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setShare(null)} aria-label="Inchide" disabled={shareBusy}>
                <IconX />
              </button>
            </div>

            {share.loading ? (
              <div className={styles.shareLoading}>Se pregătește linkul securizat…</div>
            ) : share.emailMode ? (
              <>
                <button type="button" className={styles.shareBack} onClick={() => setShare((prev) => prev ? { ...prev, emailMode: false } : prev)} disabled={shareBusy}>
                  ‹ Înapoi
                </button>
                <label className={styles.field}>
                  <span>Destinatar</span>
                  <input
                    type="email"
                    value={share.to}
                    onChange={(event) => setShare((prev) => prev ? { ...prev, to: event.target.value } : prev)}
                    placeholder="pacient@email.ro"
                  />
                </label>
                <label className={styles.field}>
                  <span>Mesaj optional</span>
                  <textarea
                    rows={3}
                    value={share.message}
                    onChange={(event) => setShare((prev) => prev ? { ...prev, message: event.target.value } : prev)}
                    placeholder="Adauga o nota scurta pentru pacient."
                  />
                </label>
                <label className={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={share.attachPdf}
                    onChange={(event) => setShare((prev) => prev ? { ...prev, attachPdf: event.target.checked } : prev)}
                  />
                  <span>Ataseaza si PDF-ul la email</span>
                </label>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.secondaryButton} onClick={() => setShare((prev) => prev ? { ...prev, emailMode: false } : prev)} disabled={shareBusy}>Anuleaza</button>
                  <button type="button" className={styles.primaryButton} onClick={sendShareEmail} disabled={shareBusy || !share.to.trim()}>
                    {shareBusy ? 'Se trimite...' : 'Trimite pe email'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.shareOptions}>
                  <button
                    type="button"
                    className={`${styles.shareOption} ${styles.shareWhatsapp}`}
                    onClick={shareWhatsApp}
                    disabled={shareBusy || !share.whatsappReady}
                  >
                    <span className={styles.shareOptionIcon}><IconWhatsApp /></span>
                    <span className={styles.shareOptionText}>
                      <strong>Trimite pe WhatsApp</strong>
                      <small>{share.whatsappReady ? 'Deschide conversația cu mesajul gata scris' : 'Pacientul nu are un număr de telefon valid'}</small>
                    </span>
                    <span className={styles.shareOptionChevron}><IconChevron /></span>
                  </button>

                  <button
                    type="button"
                    className={styles.shareOption}
                    onClick={() => setShare((prev) => prev ? { ...prev, emailMode: true } : prev)}
                    disabled={shareBusy}
                  >
                    <span className={styles.shareOptionIcon}><IconMail /></span>
                    <span className={styles.shareOptionText}>
                      <strong>Trimite pe email</strong>
                      <small>{share.to ? share.to : 'Adaugă o adresă de email'}</small>
                    </span>
                    <span className={styles.shareOptionChevron}><IconChevron /></span>
                  </button>

                  <button type="button" className={styles.shareOption} onClick={copyShareLink} disabled={shareBusy || !share.url}>
                    <span className={styles.shareOptionIcon}><IconLink /></span>
                    <span className={styles.shareOptionText}>
                      <strong>{share.copied ? 'Link copiat ✓' : 'Copiază linkul'}</strong>
                      <small>Lipește-l oriunde dorești</small>
                    </span>
                  </button>
                </div>
                {share.expiresAt && (
                  <p className={styles.shareHint}>Link securizat, valabil până la {formatExpiry(share.expiresAt)}.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
