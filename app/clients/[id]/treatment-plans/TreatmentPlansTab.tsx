'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import PlanBuilder, { type DentistOption, type TreatmentPlan } from './PlanBuilder';
import styles from './treatment-plans.module.css';
import Spinner from '@/components/Spinner';
import { ConfirmModal } from '@/app/calendar/components/modals/ConfirmModal';
import { useModal } from '@/lib/useModal';

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
  initialNewPlan?: boolean;
  seedAppointmentId?: string | null;
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
  revoked: boolean;
};

type TreatmentPlansPayload = {
  plans?: TreatmentPlan[];
  dentists?: DentistOption[];
  client?: ClientInfo;
};

const planLoadCache = new Map<string, {
  promise?: Promise<TreatmentPlansPayload>;
  data?: TreatmentPlansPayload;
  expiresAt: number;
}>();

async function fetchTreatmentPlansPayload(clientId: string): Promise<TreatmentPlansPayload> {
  const now = Date.now();
  const cached = planLoadCache.get(clientId);
  if (cached?.data && cached.expiresAt > now) return cached.data;
  if (cached?.promise) return cached.promise;

  const promise = fetch(`/api/clients/${clientId}/treatment-plans`)
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nu am putut încărca planurile.');
      planLoadCache.set(clientId, { data, expiresAt: Date.now() + 2000 });
      return data as TreatmentPlansPayload;
    })
    .catch((error) => {
      planLoadCache.delete(clientId);
      throw error;
    });

  planLoadCache.set(clientId, { promise, expiresAt: now + 2000 });
  return promise;
}

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

function formatAppointmentSource(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
  return `Pornit din programarea din ${day}, ${time}`;
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

function IconSlash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6 18.4 18.4" />
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

function IconCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
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
  initialNewPlan = false,
  seedAppointmentId = null,
  onToast,
  onFilesChanged,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  // Share dialog accessibility: initial focus, focus restore, Escape, backdrop close.
  const { overlayProps: shareOverlayProps, dialogProps: shareDialogProps } = useModal({
    isOpen: share !== null,
    onClose: () => setShare(null),
    closeDisabled: shareBusy,
  });
  const [pendingDeletePlan, setPendingDeletePlan] = useState<TreatmentPlan | null>(null);
  const [openMenuPlanId, setOpenMenuPlanId] = useState<number | null>(null);
  const handledNewPlanKeyRef = useRef<string | null>(null);
  const loadedClientIdRef = useRef<string | null>(null);
  const loadingClientIdRef = useRef<string | null>(null);
  const onToastRef = useRef(onToast);
  const onFilesChangedRef = useRef(onFilesChanged);

  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  useEffect(() => {
    onFilesChangedRef.current = onFilesChanged;
  }, [onFilesChanged]);

  const loadPlans = useCallback(async () => {
    if (loadedClientIdRef.current === clientId || loadingClientIdRef.current === clientId) return;
    loadingClientIdRef.current = clientId;
    setLoading(true);
    try {
      const data = await fetchTreatmentPlansPayload(clientId);
      setPlans(data.plans || []);
      setDentists(data.dentists || []);
      if (data.client) setClient(data.client);
      loadedClientIdRef.current = clientId;
    } catch (error) {
      onToastRef.current('error', error instanceof Error ? error.message : 'Nu am putut încărca planurile.');
    } finally {
      if (loadingClientIdRef.current === clientId) loadingClientIdRef.current = null;
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const clearNewPlanParams = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (!params.has('newPlan') && !params.has('appointmentId')) return;
    params.delete('newPlan');
    params.delete('appointmentId');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (openMenuPlanId === null) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('[data-plan-menu-root]')) setOpenMenuPlanId(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuPlanId(null);
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenuPlanId]);

  useEffect(() => {
    if (!initialNewPlan || !canEdit || loading) return;
    const key = seedAppointmentId ? `appointment:${seedAppointmentId}` : 'blank';
    if (handledNewPlanKeyRef.current === key) return;
    handledNewPlanKeyRef.current = key;

    if (!seedAppointmentId) {
      setSelectedPlan(emptyPlan(dentists));
      clearNewPlanParams();
      return;
    }

    let alive = true;
    setSelectedPlan({
      ...emptyPlan(dentists),
      source_appointment_label: 'Se pregătește planul din programare...',
    });
    void (async () => {
      try {
        const response = await fetch(`/api/appointments/${encodeURIComponent(seedAppointmentId)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.appointment) throw new Error(data.error || 'Nu am putut preîncărca programarea.');
        if (!alive) return;

        const appointment = data.appointment as {
          start_time?: string;
          dentist_id?: number | null;
          service_owner_user_id?: number | null;
          service_id?: number | null;
          service_ids?: number[];
          service_name?: string | null;
          service_names?: string[];
          price_at_time?: number | null;
          prices_at_time?: number[];
          service_price?: number | null;
        };
        const serviceIds = Array.isArray(appointment.service_ids) && appointment.service_ids.length > 0
          ? appointment.service_ids
          : typeof appointment.service_id === 'number'
            ? [appointment.service_id]
            : [];
        const serviceNames = Array.isArray(appointment.service_names) && appointment.service_names.length > 0
          ? appointment.service_names
          : appointment.service_name
            ? [appointment.service_name]
            : [];
        const prices = Array.isArray(appointment.prices_at_time) && appointment.prices_at_time.length > 0
          ? appointment.prices_at_time
          : typeof appointment.price_at_time === 'number'
            ? [appointment.price_at_time]
            : serviceNames.length === 1 && typeof appointment.service_price === 'number'
              ? [appointment.service_price]
              : [];
        const items = (serviceNames.length > 0 ? serviceNames : serviceIds.map((id) => `Serviciu #${id}`)).map((name, index) => {
          const unit = Number(prices[index] || 0);
          return {
            service_id: serviceIds[index] ?? null,
            procedure: name,
            details: '',
            quantity: 1,
            unit_price: unit,
            line_total: unit,
          };
        });
        const total = items.reduce((sum, item) => sum + item.line_total, 0);
        const doctorUserId = appointment.dentist_id || appointment.service_owner_user_id || dentists[0]?.userId || 0;
        const planDate = appointment.start_time && !Number.isNaN(new Date(appointment.start_time).getTime())
          ? new Date(appointment.start_time).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);

        setSelectedPlan({
          doctor_user_id: doctorUserId,
          plan_date: planDate,
          items: items.length > 0 ? items : [emptyPlan(dentists).items[0]].filter(Boolean),
          total_override: null,
          total,
          status: 'draft',
          pdf_file_id: null,
          source_appointment_label: formatAppointmentSource(appointment.start_time),
        });
        clearNewPlanParams();
      } catch (error) {
        if (alive) {
          const fallback = error instanceof Error ? error.message : 'Nu am putut preîncărca programarea.';
          onToast('error', 'Planul a fost deschis fără precompletare.');
          setSelectedPlan({
            ...emptyPlan(dentists),
            source_appointment_label: `${fallback} Completeaza planul manual.`,
          });
          clearNewPlanParams();
        }
      }
    })();
    return () => { alive = false; };
  }, [canEdit, clearNewPlanParams, dentists, initialNewPlan, loading, onToast, seedAppointmentId]);

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => (b.id || 0) - (a.id || 0)), [plans]);

  // Update the list only — callers decide whether the builder should open/close.
  // (Previously this force-opened the builder on every save/share/PDF, which
  // kept the editor open after saving and flashed it behind the share sheet.)
  function upsertPlan(plan: TreatmentPlan) {
    planLoadCache.delete(clientId);
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
      onFilesChangedRef.current?.();
      onToast('success', 'PDF-ul a fost generat și salvat la fișiere.');
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
      revoked: false,
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
        revoked: false,
      } : prev);
      onFilesChangedRef.current?.(); // the share endpoint generates the PDF on first use
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
        onToast('success', 'WhatsApp a fost deschis cu mesajul pregătit.');
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

  async function revokeShareLink() {
    if (!share?.plan.id) return;
    setShareBusy(true);
    try {
      const response = await fetch(`/api/clients/${clientId}/treatment-plans/${share.plan.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nu am putut dezactiva linkul.');
      if (data.plan) upsertPlan(data.plan);
      onToast('success', 'Linkul a fost dezactivat.');
      setShare((prev) => prev ? {
        ...prev,
        plan: data.plan || prev.plan,
        url: null,
        token: null,
        expiresAt: null,
        copied: false,
        revoked: true,
      } : prev);
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : 'Nu am putut dezactiva linkul.');
    } finally {
      setShareBusy(false);
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
    if (!plan.id) return;
    setBusyId(plan.id);
    try {
      const response = await fetch(`/api/clients/${clientId}/treatment-plans/${plan.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nu am putut șterge planul.');
      planLoadCache.delete(clientId);
      setPlans((prev) => prev.filter((candidate) => candidate.id !== plan.id));
      if (selectedPlan?.id === plan.id) setSelectedPlan(null);
      setPendingDeletePlan(null);
      onFilesChangedRef.current?.();
      onToast('success', 'Planul a fost șters.');
    } catch (error) {
      onToast('error', error instanceof Error ? error.message : 'Nu am putut șterge planul.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner size={24} thickness={2.2} centered={false} label="Se încarcă planurile" />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {canEdit && sortedPlans.length > 0 && (
        <div className={styles.tpToolbar}>
          <button type="button" className={styles.primaryButton} onClick={() => setSelectedPlan(emptyPlan(dentists))}>
            <IconPlus />
            <span>Plan nou</span>
          </button>
        </div>
      )}

      {selectedPlan && (
        <PlanBuilder
          clientId={clientId}
          plan={selectedPlan}
          dentists={dentists}
          canEdit={canEdit}
          clientName={client?.name || clientName}
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
            <button type="button" className={styles.primaryButton} onClick={() => setSelectedPlan(emptyPlan(dentists))}>
              <IconPlus />
              <span>Plan nou</span>
            </button>
          )}
        </div>
      ) : (
        <div className={styles.tpList}>
          {sortedPlans.map((plan) => {
            const dentistName = dentists.find((dentist) => dentist.userId === plan.doctor_user_id)?.name;
            return (
            <div key={plan.id} className={styles.tpRow}>
              <span className={styles.tpIcon}><IconFile /></span>
              <div className={styles.tpInfo}>
                <span className={styles.tpName}>Plan #{plan.id}{dentistName ? ` · ${dentistName}` : ''}</span>
                <span className={styles.tpMeta}>{plan.plan_date} · {formatMoney(plan.total)} · {plan.items.length} proceduri</span>
              </div>
              <span className={`${styles.status} ${styles[`status_${plan.status}`]}`}>{STATUS_LABELS[plan.status]}</span>
              <div className={styles.tpActions}>
                <button type="button" className={styles.tpIconBtn} onClick={() => setSelectedPlan(plan)} aria-label="Deschide" data-tooltip="Deschide">
                  <IconOpen />
                </button>
                {canEdit && (
                  <button type="button" className={styles.tpIconBtn} onClick={() => void openShareSheet(plan)} disabled={busyId === plan.id} aria-label="Trimite" data-tooltip="Trimite">
                    <IconSend />
                  </button>
                )}
                <div className={styles.moreMenu} data-plan-menu-root>
                  <button
                    type="button"
                    className={styles.tpIconBtn}
                    aria-label="Mai multe acțiuni"
                    aria-expanded={openMenuPlanId === plan.id}
                    data-tooltip="Mai multe acțiuni"
                    onClick={() => setOpenMenuPlanId((current) => current === plan.id ? null : plan.id ?? null)}
                  >
                    <IconMore />
                  </button>
                  {openMenuPlanId === plan.id && (
                    <div role="menu">
                      {canEdit && !plan.pdf_file_id && <button type="button" role="menuitem" onClick={() => { setOpenMenuPlanId(null); void generatePdf(plan); }} disabled={busyId === plan.id}><IconFile /> Generează PDF</button>}
                      {plan.pdf_file_id && <a role="menuitem" href={`/api/clients/${clientId}/files/${plan.pdf_file_id}/preview`} target="_blank" onClick={() => setOpenMenuPlanId(null)}><IconEye /> Preview / print</a>}
                      {plan.pdf_file_id && <a role="menuitem" href={`/api/clients/${clientId}/files/${plan.pdf_file_id}/download`} target="_blank" onClick={() => setOpenMenuPlanId(null)}><IconDownload /> Descarcă</a>}
                      {canEdit && <button type="button" role="menuitem" onClick={() => { setOpenMenuPlanId(null); duplicatePlan(plan); }}><IconCopy /> Duplica</button>}
                      {canEdit && <button type="button" role="menuitem" className={styles.dangerAction} onClick={() => { setOpenMenuPlanId(null); setPendingDeletePlan(plan); }} disabled={busyId === plan.id}><IconTrash /> Șterge</button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {canEdit && sortedPlans.length > 0 && !selectedPlan && !share && (
        <button type="button" className={styles.tpFab} onClick={() => setSelectedPlan(emptyPlan(dentists))} aria-label="Plan nou">
          <IconPlus />
        </button>
      )}

      {share && (
        <div className={styles.modalBackdrop} role="presentation" {...shareOverlayProps}>
          <div className={styles.shareSheet} role="dialog" aria-modal="true" aria-labelledby="share-plan-title" {...shareDialogProps}>
            <div className={styles.sheetHandle} />
            <div className={styles.modalHeader}>
              <div>
                <h3 id="share-plan-title">Trimite planul</h3>
                <span>Plan #{share.plan.id} · {formatMoney(share.plan.total)}</span>
              </div>
              <button type="button" className={styles.iconButton} onClick={() => setShare(null)} aria-label="Închide" data-tooltip="Închide" disabled={shareBusy}>
                <IconX />
              </button>
            </div>

            {share.loading ? (
              <div className={styles.shareLoading}>
                <Spinner size={22} thickness={2.2} centered={false} label="Se pregătește linkul" />
                <span>Se pregătește linkul securizat</span>
              </div>
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
                  <span>Mesaj opțional</span>
                  <textarea
                    rows={3}
                    value={share.message}
                    onChange={(event) => setShare((prev) => prev ? { ...prev, message: event.target.value } : prev)}
                    placeholder="Adaugă o nota scurta pentru pacient."
                  />
                </label>
                <label className={styles.checkboxField}>
                  <input
                    type="checkbox"
                    checked={share.attachPdf}
                    onChange={(event) => setShare((prev) => prev ? { ...prev, attachPdf: event.target.checked } : prev)}
                  />
                  <span>Ataseaza și PDF-ul la email</span>
                </label>
                <div className={styles.modalActions}>
                  <button type="button" className={styles.primaryButton} onClick={sendShareEmail} disabled={shareBusy || !share.to.trim()}>
                    {shareBusy ? (
                      <>
                        <Spinner size={14} thickness={2} centered={false} label="Se trimite" />
                        <span>Se trimite</span>
                      </>
                    ) : 'Trimite pe email'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className={`${styles.shareStatus} ${share.revoked ? styles.shareStatusRevoked : styles.shareStatusActive}`}>
                  <span className={styles.shareStatusIcon}>{share.revoked ? <IconSlash /> : share.copied ? <IconCheck /> : <IconLink />}</span>
                  <span>
                    <strong>{share.revoked ? 'Link dezactivat' : share.copied ? 'Link copiat' : 'PDF pregătit'}</strong>
                    <small>{share.revoked ? 'Linkul trimis anterior nu mai poate fi accesat.' : share.expiresAt ? `Link valabil până la ${formatExpiry(share.expiresAt)}` : 'Gata pentru trimitere.'}</small>
                  </span>
                </div>

                {!share.revoked && (
                  <div className={styles.shareReadiness} aria-label="Canale disponibile">
                    <span className={share.whatsappReady ? styles.readyItemOk : styles.readyItemMissing}>
                      <IconWhatsApp />
                      {share.whatsappReady ? 'Telefon pregătit pentru WhatsApp' : 'Telefon lipsa sau invalid'}
                    </span>
                    <span className={share.to ? styles.readyItemOk : styles.readyItemMissing}>
                      <IconMail />
                      {share.to ? share.to : 'Email lipsa'}
                    </span>
                  </div>
                )}

                {!share.revoked && (!share.whatsappReady || !share.to) && (
                  <div className={styles.shareFixHint}>
                    <span>{!share.whatsappReady ? 'Număr de telefon lipsa sau invalid.' : 'Email lipsa pentru pacient.'}</span>
                    <a href={`/clients/${clientId}/edit`}>Editează pacientul</a>
                  </div>
                )}

                <div className={styles.shareOptions}>
                  <button
                    type="button"
                    className={`${styles.shareOption} ${styles.shareWhatsapp}`}
                    onClick={shareWhatsApp}
                    disabled={shareBusy || !share.whatsappReady || share.revoked}
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
                    disabled={shareBusy || share.revoked}
                  >
                    <span className={styles.shareOptionIcon}><IconMail /></span>
                    <span className={styles.shareOptionText}>
                      <strong>Trimite pe email</strong>
                      <small>{share.to ? share.to : 'Adaugă o adresă de email'}</small>
                    </span>
                    <span className={styles.shareOptionChevron}><IconChevron /></span>
                  </button>

                  <button type="button" className={styles.shareOption} onClick={copyShareLink} disabled={shareBusy || !share.url || share.revoked}>
                    <span className={styles.shareOptionIcon}><IconLink /></span>
                    <span className={styles.shareOptionText}>
                      <strong>{share.copied ? 'Link copiat ✓' : 'Copiază linkul'}</strong>
                      <small>Lipește-l oriunde dorești</small>
                    </span>
                  </button>

                  <button type="button" className={`${styles.shareOption} ${styles.shareDanger}`} onClick={revokeShareLink} disabled={shareBusy || !share.token || share.revoked}>
                    <span className={styles.shareOptionIcon}><IconSlash /></span>
                    <span className={styles.shareOptionText}>
                      <strong>Dezactiveaza link</strong>
                      <small>Linkul trimis nu va mai putea fi accesat</small>
                    </span>
                  </button>
                </div>
                {share.expiresAt && !share.revoked && (
                  <p className={styles.shareHint}>Link securizat, valabil până la {formatExpiry(share.expiresAt)}.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={pendingDeletePlan !== null}
        title="Șterge planul?"
        message={pendingDeletePlan ? `Plan #${pendingDeletePlan.id} va fi șters din lista pacientului. PDF-ul atașat, dacă există, va fi de asemenea șters din fișiere.` : ''}
        confirmLabel="Șterge"
        cancelLabel="Renunță"
        tone="danger"
        onClose={() => setPendingDeletePlan(null)}
        onConfirm={async () => {
          if (pendingDeletePlan) await deletePlan(pendingDeletePlan);
        }}
      />
    </div>
  );
}
