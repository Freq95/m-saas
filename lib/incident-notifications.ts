import { ObjectId } from 'mongodb';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

export type OwnerNotificationStatus = 'sent' | 'failed' | 'skipped';

export interface OwnerNotificationRecord {
  tenant_id: ObjectId;
  owner_user_id: ObjectId | null;
  owner_email: string | null;
  status: OwnerNotificationStatus;
  reason: string | null;
  provider: string | null;
  provider_message_id: string | null;
  attempted_at: string;
  sent_at: string | null;
}

export interface OwnerNotificationSummary {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  last_attempt_at: string | null;
  last_sent_at: string | null;
}

function getBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return vercel.startsWith('http') ? vercel : `https://${vercel}`;
  return 'http://localhost:3000';
}

export function parseAffectedTenantIds(value: unknown): ObjectId[] {
  const rawItems: string[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      rawItems.push(typeof item === 'string' ? item.trim() : String(item || '').trim());
    }
  } else if (typeof value === 'string') {
    for (const item of value.split(',')) {
      rawItems.push(item.trim());
    }
  }

  const uniqueByHex = new Map<string, ObjectId>();
  for (const raw of rawItems) {
    if (!raw || !ObjectId.isValid(raw)) continue;
    const objectId = new ObjectId(raw);
    uniqueByHex.set(objectId.toHexString(), objectId);
    if (uniqueByHex.size >= 200) break;
  }

  return Array.from(uniqueByHex.values());
}

export function summarizeOwnerNotifications(records: OwnerNotificationRecord[]): OwnerNotificationSummary {
  const attempted = records.length;
  const sent = records.filter((record) => record.status === 'sent').length;
  const failed = records.filter((record) => record.status === 'failed').length;
  const skipped = records.filter((record) => record.status === 'skipped').length;

  const attemptedDates = records.map((record) => record.attempted_at).filter(Boolean);
  const sentDates = records.map((record) => record.sent_at).filter(Boolean) as string[];

  return {
    attempted,
    sent,
    failed,
    skipped,
    last_attempt_at: attemptedDates.length ? attemptedDates[attemptedDates.length - 1] : null,
    last_sent_at: sentDates.length ? sentDates[sentDates.length - 1] : null,
  };
}

async function sendOwnerIncidentNotificationEmail(params: {
  to: string;
  ownerName: string;
  tenantName: string;
  incidentTitle: string;
  incidentSummary: string;
  incidentSeverity: string;
  incidentStatus: string;
  discoveredAt: string | null;
  incidentId: string;
}) {
  const appBaseUrl = getBaseUrl();
  const discoveredAtLabel = params.discoveredAt
    ? new Date(params.discoveredAt).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })
    : 'necunoscut';

  return sendEmail({
    to: params.to,
    subject: `[densa] Notificare incident de securitate - ${params.tenantName}`,
    html: `
      <h2>Notificare incident de securitate</h2>
      <p>Salut ${params.ownerName || 'owner'},</p>
      <p>
        Am identificat un incident de securitate care poate afecta datele cu caracter personal pentru clinica
        <strong>${params.tenantName}</strong>.
      </p>
      <ul>
        <li><strong>Incident:</strong> ${params.incidentTitle}</li>
        <li><strong>Severitate:</strong> ${params.incidentSeverity}</li>
        <li><strong>Status curent:</strong> ${params.incidentStatus}</li>
        <li><strong>Detectat la:</strong> ${discoveredAtLabel}</li>
        <li><strong>ID incident:</strong> ${params.incidentId}</li>
      </ul>
      <p><strong>Rezumat:</strong> ${params.incidentSummary}</p>
      <p>Echipa noastra investigheaza si revine cu update-uri.</p>
      <p style="color:#666;font-size:13px;">Daca ai intrebari urgente, contacteaza suportul platformei.</p>
      <p style="color:#666;font-size:12px;">${appBaseUrl}</p>
    `,
  });
}

export async function notifyAffectedTenantOwners(params: {
  db: any;
  incident: {
    _id: ObjectId;
    title: string;
    summary: string;
    severity: string;
    status: string;
    discovered_at?: string | null;
    is_personal_data_breach?: boolean;
    affected_tenant_ids?: unknown;
  };
  actorEmail: string;
  existingNotifications?: Array<{ tenant_id?: ObjectId | string; status?: string }>;
  forceResend?: boolean;
}): Promise<OwnerNotificationRecord[]> {
  const isPersonalDataBreach = params.incident.is_personal_data_breach === true;
  if (!isPersonalDataBreach) {
    return [];
  }

  const affectedTenantIds = parseAffectedTenantIds(params.incident.affected_tenant_ids);
  if (affectedTenantIds.length === 0) {
    return [];
  }

  const existingSentTenantIds = new Set<string>();
  for (const existing of params.existingNotifications || []) {
    if (existing?.status !== 'sent' || !existing?.tenant_id) continue;
    existingSentTenantIds.add(String(existing.tenant_id));
  }

  const tenants = await params.db.collection('tenants').find({ _id: { $in: affectedTenantIds } }).toArray();
  const tenantMap = new Map<string, any>(tenants.map((tenant: any) => [String(tenant._id), tenant]));

  const ownerIds = tenants
    .map((tenant: any) => (tenant?.owner_id ? String(tenant.owner_id) : ''))
    .filter((ownerId: string) => ObjectId.isValid(ownerId))
    .map((ownerId: string) => new ObjectId(ownerId));

  const owners = ownerIds.length ? await params.db.collection('users').find({ _id: { $in: ownerIds } }).toArray() : [];
  const ownerMap = new Map<string, any>(owners.map((owner: any) => [String(owner._id), owner]));

  const attempts: OwnerNotificationRecord[] = [];

  for (const tenantId of affectedTenantIds) {
    const attemptedAt = new Date().toISOString();
    const tenant = tenantMap.get(String(tenantId));

    if (!tenant) {
      attempts.push({
        tenant_id: tenantId,
        owner_user_id: null,
        owner_email: null,
        status: 'failed',
        reason: 'tenant_not_found',
        provider: null,
        provider_message_id: null,
        attempted_at: attemptedAt,
        sent_at: null,
      });
      continue;
    }

    if (!params.forceResend && existingSentTenantIds.has(String(tenantId))) {
      attempts.push({
        tenant_id: tenantId,
        owner_user_id: tenant.owner_id && ObjectId.isValid(String(tenant.owner_id)) ? new ObjectId(String(tenant.owner_id)) : null,
        owner_email: null,
        status: 'skipped',
        reason: 'already_notified',
        provider: null,
        provider_message_id: null,
        attempted_at: attemptedAt,
        sent_at: null,
      });
      continue;
    }

    const ownerUserId = tenant.owner_id && ObjectId.isValid(String(tenant.owner_id)) ? new ObjectId(String(tenant.owner_id)) : null;
    const owner = ownerUserId ? ownerMap.get(String(ownerUserId)) : null;
    const ownerEmail = typeof owner?.email === 'string' ? owner.email.trim().toLowerCase() : '';

    if (!ownerUserId || !ownerEmail) {
      attempts.push({
        tenant_id: tenantId,
        owner_user_id: ownerUserId,
        owner_email: ownerEmail || null,
        status: 'failed',
        reason: 'owner_missing',
        provider: null,
        provider_message_id: null,
        attempted_at: attemptedAt,
        sent_at: null,
      });
      continue;
    }

    try {
      const emailResult = await sendOwnerIncidentNotificationEmail({
        to: ownerEmail,
        ownerName: typeof owner?.name === 'string' ? owner.name : 'owner',
        tenantName: typeof tenant?.name === 'string' ? tenant.name : String(tenantId),
        incidentTitle: params.incident.title,
        incidentSummary: params.incident.summary,
        incidentSeverity: params.incident.severity,
        incidentStatus: params.incident.status,
        discoveredAt: params.incident.discovered_at || null,
        incidentId: String(params.incident._id),
      });

      if (emailResult.ok) {
        attempts.push({
          tenant_id: tenantId,
          owner_user_id: ownerUserId,
          owner_email: ownerEmail,
          status: 'sent',
          reason: null,
          provider: emailResult.provider,
          provider_message_id: emailResult.id || null,
          attempted_at: attemptedAt,
          sent_at: new Date().toISOString(),
        });
      } else {
        attempts.push({
          tenant_id: tenantId,
          owner_user_id: ownerUserId,
          owner_email: ownerEmail,
          status: 'failed',
          reason: emailResult.reason,
          provider: null,
          provider_message_id: null,
          attempted_at: attemptedAt,
          sent_at: null,
        });
      }
    } catch (error) {
      logger.error('[INCIDENT] Failed owner notification send', {
        incidentId: String(params.incident._id),
        tenantId: String(tenantId),
        actorEmail: params.actorEmail,
        error,
      });
      attempts.push({
        tenant_id: tenantId,
        owner_user_id: ownerUserId,
        owner_email: ownerEmail,
        status: 'failed',
        reason: 'provider_error',
        provider: null,
        provider_message_id: null,
        attempted_at: attemptedAt,
        sent_at: null,
      });
    }
  }

  return attempts;
}
