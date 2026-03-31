import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

export const INCIDENT_SEVERITY_VALUES = ['low', 'medium', 'high', 'critical'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITY_VALUES)[number];

export const INCIDENT_STATUS_VALUES = ['open', 'investigating', 'contained', 'resolved', 'closed'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUS_VALUES)[number];

let incidentIndexesEnsured = false;

export async function ensureSecurityIncidentIndexes(): Promise<void> {
  if (incidentIndexesEnsured) {
    return;
  }
  const db = await getMongoDbOrThrow();
  await Promise.all([
    db.collection('security_incidents').createIndex({ created_at: -1 }),
    db.collection('security_incidents').createIndex({ status: 1, created_at: -1 }),
    db.collection('security_incidents').createIndex({ severity: 1, created_at: -1 }),
    db.collection('security_incidents').createIndex({ discovered_at: -1 }),
    db.collection('security_incidents').createIndex({ notification_due_at: 1 }),
    db.collection('security_incidents').createIndex({ affected_tenant_ids: 1, created_at: -1 }),
  ]);
  incidentIndexesEnsured = true;
}

function toDateOrNull(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export function toIsoDateOrThrow(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} must be a valid ISO date`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date`);
  }
  return parsed.toISOString();
}

export function computeNotificationDueAt(discoveredAtIso: string): string {
  const discoveredAt = new Date(discoveredAtIso);
  const due = new Date(discoveredAt.getTime() + 72 * 60 * 60 * 1000);
  return due.toISOString();
}

export function computeDeadlineState(incident: {
  discovered_at?: string | null;
  notification_due_at?: string | null;
  regulator_notified_at?: string | null;
}): {
  notificationDueAt: string | null;
  deadlineStatus: 'pending' | 'met' | 'overdue';
  hoursUntilDeadline: number | null;
} {
  const discoveredAt = toDateOrNull(incident.discovered_at ?? null);
  const dueAt = toDateOrNull(incident.notification_due_at ?? null);
  const regulatorNotifiedAt = toDateOrNull(incident.regulator_notified_at ?? null);

  if (!discoveredAt || !dueAt) {
    return {
      notificationDueAt: null,
      deadlineStatus: regulatorNotifiedAt ? 'met' : 'pending',
      hoursUntilDeadline: null,
    };
  }

  const nowMs = Date.now();
  const dueMs = dueAt.getTime();
  const hoursUntilDeadline = Math.round(((dueMs - nowMs) / (60 * 60 * 1000)) * 10) / 10;

  if (regulatorNotifiedAt) {
    return {
      notificationDueAt: dueAt.toISOString(),
      deadlineStatus: 'met',
      hoursUntilDeadline,
    };
  }

  return {
    notificationDueAt: dueAt.toISOString(),
    deadlineStatus: nowMs > dueMs ? 'overdue' : 'pending',
    hoursUntilDeadline,
  };
}
