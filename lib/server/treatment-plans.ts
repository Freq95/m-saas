import { ObjectId } from 'mongodb';
import { createHash, randomBytes } from 'crypto';
import { AuthError, type AuthContext } from '@/lib/auth-helpers';
import {
  getMongoDbOrThrow,
  getNextNumericId,
  stripMongoId,
  type FlexDoc,
} from '@/lib/db/mongo-utils';
import { buildClientStorageKey, getStorageProvider, isStorageConfigured } from '@/lib/storage';
import type {
  CreatePlanInput,
  TreatmentPlanItemInput,
  TreatmentPlanSettingsInput,
  UpdatePlanInput,
} from '@/lib/treatment-plans/schemas';
import { renderTreatmentPlanPdf } from '@/lib/treatment-plans/pdf';

export const DEFAULT_TREATMENT_PLAN_DISCLAIMER =
  'Planul de tratament poate suferi modificari in functie de evolutia clinica si necesitatile aparute pe parcursul tratamentului.';

export type TreatmentPlanStatus = 'draft' | 'sent' | 'accepted';

export type TreatmentPlanItem = {
  service_id: number | null;
  procedure: string;
  details: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type TreatmentPlanRecapLine = {
  label: string;
  amount: number;
};

export type TreatmentPlanDoc = {
  id: number;
  tenant_id: ObjectId;
  user_id: number;
  client_id: number;
  doctor_user_id: number;
  doctor_name_snapshot: string;
  doctor_subtitle_snapshot: string | null;
  doctor_specialty_snapshot: string | null;
  plan_date: string;
  items: TreatmentPlanItem[];
  recap: TreatmentPlanRecapLine[];
  total_override: number | null;
  total: number;
  currency: string;
  clinic_name_snapshot: string;
  logo_storage_key_snapshot: string | null;
  disclaimer_snapshot: string;
  signature_label_doctor_snapshot: string;
  signature_label_patient_snapshot: string;
  status: TreatmentPlanStatus;
  pdf_file_id: number | null;
  sent_at: string | null;
  sent_to_email: string | null;
  sent_via?: 'email' | 'whatsapp' | null;
  created_by_user_id: ObjectId;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
};

export type TreatmentPlanSettingsDoc = {
  id?: number;
  tenant_id: ObjectId;
  clinic_name: string;
  logo_storage_key: string | null;
  disclaimer: string;
  signature_label_doctor: string;
  signature_label_patient: string;
  currency: string;
  created_at?: string;
  updated_at?: string;
};

export type TreatmentPlanDentistOption = {
  userId: number;
  name: string;
  doctorSubtitle: string | null;
  doctorSpecialty: string | null;
};

type Scope = {
  tenantId: ObjectId;
  userId: number;
  clientId: number;
};

type DoctorIdentity = {
  userId: number;
  name: string;
  subtitle: string | null;
  specialty: string | null;
};

function defaultSettings(tenantId: ObjectId): TreatmentPlanSettingsDoc {
  return {
    tenant_id: tenantId,
    clinic_name: 'CMArt Dent',
    logo_storage_key: null,
    disclaimer: DEFAULT_TREATMENT_PLAN_DISCLAIMER,
    signature_label_doctor: 'Semnatura medic',
    signature_label_patient: 'Semnatura pacient',
    currency: 'lei',
  };
}

function roundMoney(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function normalizeItems(items: TreatmentPlanItemInput[]): TreatmentPlanItem[] {
  return items.map((item) => {
    const quantity = roundMoney(item.quantity);
    const unitPrice = roundMoney(item.unit_price);
    const computedTotal = roundMoney(quantity * unitPrice);
    // line_total is the editable cost: honor an explicit value (including 0 for
    // a complimentary line); fall back to quantity × unit_price only when none
    // was supplied (null/omitted).
    const lineTotal = item.line_total === null || item.line_total === undefined
      ? computedTotal
      : roundMoney(item.line_total);
    return {
      service_id: item.service_id ?? null,
      procedure: item.procedure.trim(),
      details: item.details?.trim() ?? '',
      quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
    };
  });
}

export function deriveTreatmentPlanTotals(
  items: TreatmentPlanItem[],
  totalOverride?: number | null
): { recap: TreatmentPlanRecapLine[]; total: number; total_override: number | null } {
  const recapByLabel = new Map<string, number>();
  for (const item of items) {
    const label = item.procedure.trim() || 'Procedura';
    recapByLabel.set(label, roundMoney((recapByLabel.get(label) ?? 0) + item.line_total));
  }
  const recap = Array.from(recapByLabel.entries()).map(([label, amount]) => ({ label, amount }));
  const sum = roundMoney(items.reduce((acc, item) => acc + item.line_total, 0));
  const normalizedOverride = totalOverride === null || totalOverride === undefined
    ? null
    : roundMoney(totalOverride);
  return {
    recap,
    total_override: normalizedOverride,
    total: normalizedOverride ?? sum,
  };
}

async function getDoctorIdentity(tenantId: ObjectId, doctorUserId: number): Promise<DoctorIdentity> {
  const db = await getMongoDbOrThrow();
  const doctor = await db.collection('users').findOne({
    id: doctorUserId,
    tenant_id: tenantId,
    role: { $in: ['owner', 'dentist'] },
    status: { $ne: 'deleted' },
  });
  if (!doctor) {
    throw new AuthError('Medicul selectat nu exista in aceasta clinica.', 404);
  }
  return {
    userId: doctorUserId,
    name: doctor.name || doctor.email || `Medic ${doctorUserId}`,
    subtitle: doctor.plan_doctor_subtitle || null,
    specialty: doctor.plan_doctor_specialty || null,
  };
}

async function assertCanUseDoctor(auth: AuthContext, doctorUserId: number): Promise<void> {
  if (auth.role === 'owner') {
    await getDoctorIdentity(auth.tenantId, doctorUserId);
    return;
  }
  if (auth.role === 'dentist' && auth.userId === doctorUserId) {
    return;
  }
  if (auth.role === 'asistent' && auth.assigned_dentist_user_ids?.includes(doctorUserId)) {
    await getDoctorIdentity(auth.tenantId, doctorUserId);
    return;
  }
  throw new AuthError('Nu ai dreptul sa actionezi pentru medicul selectat.', 403);
}

export async function listTreatmentPlanDentists(auth: AuthContext): Promise<TreatmentPlanDentistOption[]> {
  const db = await getMongoDbOrThrow();
  const filter: Record<string, unknown> = {
    tenant_id: auth.tenantId,
    role: { $in: ['owner', 'dentist'] },
    status: { $ne: 'deleted' },
  };

  if (auth.role === 'dentist') {
    filter.id = auth.userId;
  } else if (auth.role === 'asistent') {
    filter.id = { $in: auth.assigned_dentist_user_ids ?? [] };
  }

  const docs = await db.collection('users').find(filter)
    .project({ id: 1, name: 1, email: 1, plan_doctor_subtitle: 1, plan_doctor_specialty: 1 })
    .sort({ name: 1 })
    .toArray();

  return docs
    .filter((doctor: any) => typeof doctor.id === 'number')
    .map((doctor: any) => ({
      userId: doctor.id,
      name: doctor.name || doctor.email || `Medic ${doctor.id}`,
      doctorSubtitle: doctor.plan_doctor_subtitle || null,
      doctorSpecialty: doctor.plan_doctor_specialty || null,
    }));
}

export async function getTreatmentPlanSettings(tenantId: ObjectId): Promise<TreatmentPlanSettingsDoc> {
  const db = await getMongoDbOrThrow();
  const settings = await db.collection('treatment_plan_settings').findOne({ tenant_id: tenantId });
  if (!settings) return defaultSettings(tenantId);
  return {
    ...defaultSettings(tenantId),
    ...(stripMongoId(settings) as Partial<TreatmentPlanSettingsDoc>),
  };
}

export async function getTreatmentPlanSettingsPayload(auth: AuthContext) {
  const db = await getMongoDbOrThrow();
  const [settings, user] = await Promise.all([
    getTreatmentPlanSettings(auth.tenantId),
    db.collection('users').findOne({ _id: auth.dbUserId, tenant_id: auth.tenantId }),
  ]);
  return {
    settings,
    doctorSubtitle: user?.plan_doctor_subtitle || '',
    doctorSpecialty: user?.plan_doctor_specialty || '',
  };
}

export async function upsertTreatmentPlanSettings(
  auth: AuthContext,
  input: TreatmentPlanSettingsInput
): Promise<Awaited<ReturnType<typeof getTreatmentPlanSettingsPayload>>> {
  const db = await getMongoDbOrThrow();
  const now = new Date().toISOString();

  const clinicUpdate: Record<string, unknown> = {};
  if (auth.role === 'owner') {
    for (const key of [
      'clinic_name',
      'disclaimer',
      'signature_label_doctor',
      'signature_label_patient',
      'currency',
    ] as const) {
      if (input[key] !== undefined) clinicUpdate[key] = input[key];
    }
  }

  if (Object.keys(clinicUpdate).length > 0) {
    const existing = await db.collection('treatment_plan_settings').findOne({ tenant_id: auth.tenantId });
    if (existing) {
      await db.collection('treatment_plan_settings').updateOne(
        { tenant_id: auth.tenantId },
        { $set: { ...clinicUpdate, updated_at: now } }
      );
    } else {
      const id = await getNextNumericId('treatment_plan_settings');
      await db.collection<FlexDoc>('treatment_plan_settings').insertOne({
        _id: id,
        id,
        ...defaultSettings(auth.tenantId),
        ...clinicUpdate,
        created_at: now,
        updated_at: now,
      });
    }
  }

  const userUpdate: Record<string, unknown> = { updated_at: now };
  if (input.doctorSubtitle !== undefined) userUpdate.plan_doctor_subtitle = input.doctorSubtitle || null;
  if (input.doctorSpecialty !== undefined) userUpdate.plan_doctor_specialty = input.doctorSpecialty || null;
  if (Object.keys(userUpdate).length > 1) {
    await db.collection('users').updateOne(
      { _id: auth.dbUserId, tenant_id: auth.tenantId },
      { $set: userUpdate }
    );
  }

  return getTreatmentPlanSettingsPayload(auth);
}

export async function setTreatmentPlanLogo(
  auth: AuthContext,
  logoStorageKey: string
): Promise<TreatmentPlanSettingsDoc> {
  if (auth.role !== 'owner') {
    throw new AuthError('Doar proprietarul clinicii poate schimba logo-ul.', 403);
  }

  const db = await getMongoDbOrThrow();
  const now = new Date().toISOString();
  const existing = await db.collection('treatment_plan_settings').findOne({ tenant_id: auth.tenantId });
  if (existing) {
    await db.collection('treatment_plan_settings').updateOne(
      { tenant_id: auth.tenantId },
      { $set: { logo_storage_key: logoStorageKey, updated_at: now } }
    );
  } else {
    const id = await getNextNumericId('treatment_plan_settings');
    await db.collection<FlexDoc>('treatment_plan_settings').insertOne({
      _id: id,
      id,
      ...defaultSettings(auth.tenantId),
      logo_storage_key: logoStorageKey,
      created_at: now,
      updated_at: now,
    });
  }
  return getTreatmentPlanSettings(auth.tenantId);
}

function snapshotFields(settings: TreatmentPlanSettingsDoc, doctor: DoctorIdentity) {
  return {
    doctor_user_id: doctor.userId,
    doctor_name_snapshot: doctor.name,
    doctor_subtitle_snapshot: doctor.subtitle,
    doctor_specialty_snapshot: doctor.specialty,
    currency: settings.currency,
    clinic_name_snapshot: settings.clinic_name,
    logo_storage_key_snapshot: settings.logo_storage_key,
    disclaimer_snapshot: settings.disclaimer,
    signature_label_doctor_snapshot: settings.signature_label_doctor,
    signature_label_patient_snapshot: settings.signature_label_patient,
  };
}

export async function listTreatmentPlans(scope: Scope): Promise<TreatmentPlanDoc[]> {
  const db = await getMongoDbOrThrow();
  const docs = await db.collection('treatment_plans').find({
    tenant_id: scope.tenantId,
    user_id: scope.userId,
    client_id: scope.clientId,
    deleted_at: { $exists: false },
  }).sort({ created_at: -1 }).toArray();
  return docs.map((doc) => stripMongoId(doc) as TreatmentPlanDoc);
}

export async function getTreatmentPlan(scope: Scope, planId: number): Promise<TreatmentPlanDoc | null> {
  const db = await getMongoDbOrThrow();
  const doc = await db.collection('treatment_plans').findOne({
    id: planId,
    tenant_id: scope.tenantId,
    user_id: scope.userId,
    client_id: scope.clientId,
    deleted_at: { $exists: false },
  });
  return doc ? stripMongoId(doc) as TreatmentPlanDoc : null;
}

export async function createTreatmentPlan(
  scope: Scope,
  auth: AuthContext,
  input: CreatePlanInput
): Promise<TreatmentPlanDoc> {
  const db = await getMongoDbOrThrow();
  const doctorUserId = input.doctor_user_id ?? auth.userId;
  await assertCanUseDoctor(auth, doctorUserId);

  const [settings, doctor] = await Promise.all([
    getTreatmentPlanSettings(scope.tenantId),
    getDoctorIdentity(scope.tenantId, doctorUserId),
  ]);
  const items = normalizeItems(input.items);
  const totals = deriveTreatmentPlanTotals(items, input.total_override);
  const id = await getNextNumericId('treatment_plans');
  const now = new Date().toISOString();

  const doc: TreatmentPlanDoc & FlexDoc = {
    _id: id,
    id,
    tenant_id: scope.tenantId,
    user_id: scope.userId,
    client_id: scope.clientId,
    ...snapshotFields(settings, doctor),
    plan_date: input.plan_date ?? now.slice(0, 10),
    items,
    ...totals,
    status: 'draft',
    pdf_file_id: null,
    sent_at: null,
    sent_to_email: null,
    sent_via: null,
    created_by_user_id: auth.dbUserId,
    created_at: now,
    updated_at: now,
  };

  await db.collection<FlexDoc>('treatment_plans').insertOne(doc);
  return stripMongoId(doc) as TreatmentPlanDoc;
}

export async function updateTreatmentPlan(
  scope: Scope,
  auth: AuthContext,
  planId: number,
  input: UpdatePlanInput
): Promise<TreatmentPlanDoc | null> {
  const db = await getMongoDbOrThrow();
  const existing = await getTreatmentPlan(scope, planId);
  if (!existing) return null;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const editsLineData =
    input.items !== undefined ||
    input.total_override !== undefined ||
    input.plan_date !== undefined ||
    input.doctor_user_id !== undefined;

  if (editsLineData && existing.status !== 'draft') {
    throw new AuthError('Planurile trimise nu mai pot fi editate.', 409);
  }

  // A plan that has left 'draft' cannot be reverted to it — otherwise the edit
  // lock above could be bypassed by first PATCHing status back to draft, then
  // mutating a document the patient may already have received.
  if (input.status !== undefined && input.status !== existing.status
      && input.status === 'draft' && existing.status !== 'draft') {
    throw new AuthError('Un plan deja trimis nu poate reveni la ciorna.', 409);
  }

  if (input.plan_date !== undefined) update.plan_date = input.plan_date;
  if (input.status !== undefined) update.status = input.status;

  let nextItems = existing.items;
  if (input.items !== undefined) {
    nextItems = normalizeItems(input.items);
    update.items = nextItems;
  }
  if (input.items !== undefined || input.total_override !== undefined) {
    const totals = deriveTreatmentPlanTotals(
      nextItems,
      input.total_override !== undefined ? input.total_override : existing.total_override
    );
    update.recap = totals.recap;
    update.total_override = totals.total_override;
    update.total = totals.total;
  }

  if (input.doctor_user_id !== undefined) {
    await assertCanUseDoctor(auth, input.doctor_user_id);
    const doctor = await getDoctorIdentity(scope.tenantId, input.doctor_user_id);
    update.doctor_user_id = doctor.userId;
    update.doctor_name_snapshot = doctor.name;
    update.doctor_subtitle_snapshot = doctor.subtitle;
    update.doctor_specialty_snapshot = doctor.specialty;
  }

  // Editing line data makes any previously-generated PDF stale; drop it so the
  // next share/preview regenerates a fresh one. Best-effort file cleanup.
  if (editsLineData && existing.pdf_file_id) {
    update.pdf_file_id = null;
    try {
      const oldFile = await db.collection('client_files').findOne({
        id: existing.pdf_file_id,
        tenant_id: scope.tenantId,
        client_id: scope.clientId,
      });
      if (oldFile?.storage_key && isStorageConfigured()) {
        await getStorageProvider().delete(String(oldFile.storage_key));
      }
      await db.collection('client_files').deleteOne({
        id: existing.pdf_file_id,
        tenant_id: scope.tenantId,
        client_id: scope.clientId,
      });
    } catch {
      // Non-fatal: a leftover file is harmless; the plan no longer points at it.
    }
  }

  const result = await db.collection('treatment_plans').findOneAndUpdate(
    {
      id: planId,
      tenant_id: scope.tenantId,
      user_id: scope.userId,
      client_id: scope.clientId,
      deleted_at: { $exists: false },
    },
    { $set: update },
    { returnDocument: 'after' }
  );

  return result ? stripMongoId(result) as TreatmentPlanDoc : null;
}

export async function softDeleteTreatmentPlan(scope: Scope, planId: number): Promise<boolean> {
  const db = await getMongoDbOrThrow();
  const plan = await getTreatmentPlan(scope, planId);
  if (!plan) return false;

  if (plan.pdf_file_id) {
    const file = await db.collection('client_files').findOne({
      id: plan.pdf_file_id,
      tenant_id: scope.tenantId,
      client_id: scope.clientId,
    });
    if (file?.storage_key && isStorageConfigured()) {
      await getStorageProvider().delete(String(file.storage_key));
    }
    await db.collection('client_files').deleteOne({
      id: plan.pdf_file_id,
      tenant_id: scope.tenantId,
      client_id: scope.clientId,
    });
  }

  const result = await db.collection('treatment_plans').updateOne(
    {
      id: planId,
      tenant_id: scope.tenantId,
      user_id: scope.userId,
      client_id: scope.clientId,
      deleted_at: { $exists: false },
    },
    { $set: { deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), pdf_file_id: null } }
  );
  return result.matchedCount > 0;
}

function sanitizeFilenamePart(value: string): string {
  return value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'pacient';
}

function hashPublicToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueTreatmentPlanPublicLink(
  scope: Scope,
  planId: number,
  expiresInDays = 30
): Promise<{ token: string; expiresAt: string } | null> {
  const db = await getMongoDbOrThrow();
  const plan = await getTreatmentPlan(scope, planId);
  if (!plan?.pdf_file_id) return null;

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashPublicToken(token);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  // Store ONLY the SHA-256 hash — never the plaintext token. A DB leak/backup
  // must not expose live links to patients' treatment-plan PDFs.
  await db.collection('treatment_plan_public_links').insertOne({
    tenant_id: scope.tenantId,
    user_id: scope.userId,
    client_id: scope.clientId,
    plan_id: planId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    expires_at_date: new Date(expiresAt),
    created_at: now,
    updated_at: now,
  });

  return { token, expiresAt };
}

export async function getPublicTreatmentPlanPdfUrl(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;

  const db = await getMongoDbOrThrow();
  const tokenHash = hashPublicToken(token);
  const now = new Date().toISOString();
  const link = await db.collection('treatment_plan_public_links').findOne({
    token_hash: tokenHash,
    expires_at: { $gt: now },
    revoked_at: { $exists: false },
  });
  if (!link) return null;
  const plan = await db.collection('treatment_plans').findOne({
    id: link.plan_id,
    tenant_id: link.tenant_id,
    user_id: link.user_id,
    client_id: link.client_id,
    deleted_at: { $exists: false },
    pdf_file_id: { $ne: null },
  });
  if (!plan?.pdf_file_id) return null;

  const file = await db.collection('client_files').findOne({
    id: plan.pdf_file_id,
    tenant_id: plan.tenant_id,
    client_id: plan.client_id,
  });
  if (!file?.storage_key) return null;

  return getStorageProvider().getSignedUrl(
    String(file.storage_key),
    900,
    {
      contentDisposition: `inline; filename="${file.original_filename || 'Plan-de-tratament.pdf'}"`,
      contentType: 'application/pdf',
    }
  );
}

/**
 * Normalize a (possibly Romanian) phone number into a bare international form
 * suitable for a wa.me link (digits only, no '+'). Returns null when the input
 * can't plausibly be a phone number.
 *   "07xx xxx xxx" → "407xxxxxxxx"; "+40 7xx…" → "407xxxxxxxx"; keeps other
 *   international numbers as-is.
 */
export function normalizeRoPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `40${digits.slice(1)}`;
  else if (digits.length === 9 && digits.startsWith('7')) digits = `40${digits}`;
  if (/^407\d{8}$/.test(digits)) return digits;
  if (digits.length >= 8 && digits.length <= 15) return digits;
  return null;
}

/**
 * Reuse the plan's current public link if the caller already holds a valid,
 * unexpired token; otherwise mint a fresh one. Lets a single share session
 * (copy + WhatsApp + email) reuse ONE link instead of reissuing and silently
 * invalidating a link the patient may have already received.
 */
export async function resolveOrIssuePublicLink(
  scope: Scope,
  planId: number,
  existingToken?: string | null
): Promise<{ token: string; expiresAt: string } | null> {
  if (existingToken && /^[A-Za-z0-9_-]{32,128}$/.test(existingToken)) {
    const db = await getMongoDbOrThrow();
    const now = new Date().toISOString();
    const link = await db.collection('treatment_plan_public_links').findOne({
      tenant_id: scope.tenantId,
      user_id: scope.userId,
      client_id: scope.clientId,
      plan_id: planId,
      token_hash: hashPublicToken(existingToken),
      revoked_at: { $exists: false },
      expires_at: { $gt: now },
    });
    if (link?.expires_at) return { token: existingToken, expiresAt: String(link.expires_at) };
  }
  // No cross-session reuse: tokens are hash-only, so a fresh share session that
  // doesn't already hold the plaintext mints a new link (invalidating the prior).
  return issueTreatmentPlanPublicLink(scope, planId);
}

export async function markTreatmentPlanSent(
  scope: Scope,
  planId: number,
  via: 'email' | 'whatsapp',
  sentToEmail?: string | null
): Promise<TreatmentPlanDoc | null> {
  const db = await getMongoDbOrThrow();
  const existing = await getTreatmentPlan(scope, planId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const set: Record<string, unknown> = {
    // Never downgrade an already-accepted plan back to 'sent'.
    status: existing.status === 'accepted' ? 'accepted' : 'sent',
    sent_at: now,
    sent_via: via,
    updated_at: now,
  };
  if (sentToEmail) set.sent_to_email = sentToEmail;
  const result = await db.collection('treatment_plans').findOneAndUpdate(
    {
      id: planId,
      tenant_id: scope.tenantId,
      user_id: scope.userId,
      client_id: scope.clientId,
      deleted_at: { $exists: false },
    },
    { $set: set },
    { returnDocument: 'after' }
  );
  return result ? stripMongoId(result) as TreatmentPlanDoc : null;
}

export type PublicTreatmentPlanView = {
  clinicName: string;
  logoUrl: string | null;
  patientFirstName: string;
  planDate: string;
  doctorName: string;
  recap: TreatmentPlanRecapLine[];
  total: number;
  currency: string;
  disclaimer: string;
  expiresAt: string;
};

/**
 * Safe, patient-facing projection of a plan resolved purely by its share token
 * (the link is the only credential). Exposes the patient's FIRST NAME only and
 * the plan's financials/branding — never email, phone, full name, or any other
 * patient's data. Returns null for an invalid/expired/missing-PDF token.
 */
export async function getPublicTreatmentPlanView(token: string): Promise<PublicTreatmentPlanView | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null;
  const db = await getMongoDbOrThrow();
  const tokenHash = hashPublicToken(token);
  const now = new Date().toISOString();
  const link = await db.collection('treatment_plan_public_links').findOne({
    token_hash: tokenHash,
    expires_at: { $gt: now },
    revoked_at: { $exists: false },
  });
  if (!link) return null;
  const plan = await db.collection('treatment_plans').findOne({
    id: link.plan_id,
    tenant_id: link.tenant_id,
    user_id: link.user_id,
    client_id: link.client_id,
    deleted_at: { $exists: false },
    pdf_file_id: { $ne: null },
  });
  if (!plan) return null;

  const client = await db.collection('clients').findOne(
    { id: plan.client_id, tenant_id: plan.tenant_id },
    { projection: { name: 1 } }
  );
  const firstName = String(client?.name || 'Pacient').trim().split(/\s+/)[0] || 'Pacient';

  let logoUrl: string | null = null;
  if (plan.logo_storage_key_snapshot && isStorageConfigured()) {
    try {
      logoUrl = await getStorageProvider().getSignedUrl(String(plan.logo_storage_key_snapshot), 900, {
        contentType: 'image/png',
      });
    } catch {
      logoUrl = null;
    }
  }

  return {
    clinicName: plan.clinic_name_snapshot || 'Clinica',
    logoUrl,
    patientFirstName: firstName,
    planDate: plan.plan_date,
    doctorName: plan.doctor_name_snapshot || '',
    recap: Array.isArray(plan.recap) ? plan.recap : [],
    total: typeof plan.total === 'number' ? plan.total : 0,
    currency: plan.currency || 'lei',
    disclaimer: plan.disclaimer_snapshot || '',
    expiresAt: String(link.expires_at || ''),
  };
}

async function createClientPdfFile(scope: Scope, clientName: string, plan: TreatmentPlanDoc, pdf: Buffer) {
  const db = await getMongoDbOrThrow();
  const fileId = await getNextNumericId('client_files');
  const filename = `Plan-tratament-${sanitizeFilenamePart(clientName)}-${plan.plan_date}.pdf`;
  const storageKey = buildClientStorageKey(String(scope.tenantId), scope.clientId, filename);
  await getStorageProvider().upload(storageKey, pdf, 'application/pdf');

  const now = new Date().toISOString();
  const fileDoc = {
    _id: fileId,
    id: fileId,
    tenant_id: scope.tenantId,
    client_id: scope.clientId,
    filename: storageKey.split('/').pop() || filename,
    original_filename: filename,
    storage_key: storageKey,
    file_size: pdf.length,
    mime_type: 'application/pdf',
    description: 'Plan de tratament',
    created_at: now,
    updated_at: now,
  };
  await db.collection<FlexDoc>('client_files').insertOne(fileDoc);
  await db.collection('clients').updateOne(
    { id: scope.clientId, tenant_id: scope.tenantId },
    { $set: { last_activity_date: now, updated_at: now } }
  );
  return stripMongoId(fileDoc);
}

export async function generateTreatmentPlanPdfFile(scope: Scope, planId: number): Promise<TreatmentPlanDoc | null> {
  const db = await getMongoDbOrThrow();
  let plan = await getTreatmentPlan(scope, planId);
  if (!plan) return null;

  const client = await db.collection('clients').findOne({
    id: scope.clientId,
    tenant_id: scope.tenantId,
    deleted_at: { $exists: false },
  });
  if (!client) return null;

  if (plan.status === 'draft' || !plan.pdf_file_id) {
    const [settings, doctor] = await Promise.all([
      getTreatmentPlanSettings(scope.tenantId),
      getDoctorIdentity(scope.tenantId, plan.doctor_user_id),
    ]);
    const snapshot = snapshotFields(settings, doctor);
    const result = await db.collection('treatment_plans').findOneAndUpdate(
      {
        id: planId,
        tenant_id: scope.tenantId,
        user_id: scope.userId,
        client_id: scope.clientId,
        deleted_at: { $exists: false },
      },
      { $set: { ...snapshot, updated_at: new Date().toISOString() } },
      { returnDocument: 'after' }
    );
    if (!result) return null;
    plan = stripMongoId(result) as TreatmentPlanDoc;
  }

  let logoBuffer: Buffer | undefined;
  if (plan.logo_storage_key_snapshot && isStorageConfigured()) {
    try {
      logoBuffer = await getStorageProvider().download(plan.logo_storage_key_snapshot);
    } catch {
      logoBuffer = undefined;
    }
  }

  // Remember the file we're replacing so regeneration doesn't leak orphans.
  const previousPdfFileId = plan.pdf_file_id;

  const pdf = await renderTreatmentPlanPdf(plan, {
    clientName: client.name || 'Pacient',
    logoBuffer,
  });
  const file = await createClientPdfFile(scope, client.name || 'Pacient', plan, pdf);
  const newFileId = (file as any).id as number;

  const updated = await db.collection('treatment_plans').findOneAndUpdate(
    {
      id: planId,
      tenant_id: scope.tenantId,
      user_id: scope.userId,
      client_id: scope.clientId,
      deleted_at: { $exists: false },
    },
    { $set: { pdf_file_id: newFileId, updated_at: new Date().toISOString() } },
    { returnDocument: 'after' }
  );

  // Delete the superseded PDF (storage object + file row) once the plan points
  // at the fresh one.
  if (previousPdfFileId && previousPdfFileId !== newFileId) {
    try {
      const old = await db.collection('client_files').findOne({
        id: previousPdfFileId,
        tenant_id: scope.tenantId,
        client_id: scope.clientId,
      });
      if (old?.storage_key && isStorageConfigured()) {
        await getStorageProvider().delete(String(old.storage_key));
      }
      await db.collection('client_files').deleteOne({
        id: previousPdfFileId,
        tenant_id: scope.tenantId,
        client_id: scope.clientId,
      });
    } catch {
      // Best-effort cleanup; never fail the regeneration over a stale file.
    }
  }

  return updated ? stripMongoId(updated) as TreatmentPlanDoc : null;
}

/** Deactivate a plan's public share link (invalidates any link already sent). */
export async function revokeTreatmentPlanPublicLink(scope: Scope, planId: number): Promise<TreatmentPlanDoc | null> {
  const db = await getMongoDbOrThrow();
  const now = new Date().toISOString();
  await db.collection('treatment_plan_public_links').updateMany(
    {
      tenant_id: scope.tenantId,
      user_id: scope.userId,
      client_id: scope.clientId,
      plan_id: planId,
      revoked_at: { $exists: false },
    },
    { $set: { revoked_at: now, updated_at: now } }
  );
  return getTreatmentPlan(scope, planId);
}
