import type { Db, Document } from 'mongodb';
import { MINIMUM_CLINICAL_RETENTION_YEARS } from '@/lib/retention';

function subtractUtcYears(date: Date, years: number) {
  const result = new Date(date);
  result.setUTCFullYear(result.getUTCFullYear() - years);
  return result;
}

async function latestField(db: Db, collectionName: string, filter: Document, field: string) {
  const doc = await db.collection(collectionName).findOne(filter, {
    projection: { [field]: 1 },
    sort: { [field]: -1 },
  });
  return doc?.[field];
}

export async function getLastPatientContact(db: Db, patient: Document): Promise<Date | null> {
  const scope = { tenant_id: patient.tenant_id, client_id: patient.id };
  const legacyScope = { tenant_id: patient.tenant_id, contact_id: patient.id };
  const values = await Promise.all([
    latestField(db, 'appointments', scope, 'start_time'),
    latestField(db, 'conversations', scope, 'updated_at'),
    latestField(db, 'client_notes', scope, 'created_at'),
    latestField(db, 'contact_notes', legacyScope, 'created_at'),
    latestField(db, 'client_files', scope, 'created_at'),
    latestField(db, 'contact_files', legacyScope, 'created_at'),
    latestField(db, 'tooth_events', scope, 'occurred_at'),
    latestField(db, 'surgery_groups', scope, 'created_at'),
    latestField(db, 'bridge_groups', scope, 'created_at'),
    latestField(db, 'treatment_plans', scope, 'updated_at'),
  ]);
  const timestamps = [
    patient.last_activity_date,
    patient.last_appointment_date,
    patient.last_conversation_date,
    patient.created_at,
    ...values,
  ]
    .map((value) => typeof value === 'string' || value instanceof Date ? new Date(value) : null)
    .filter((value): value is Date => Boolean(value && !Number.isNaN(value.getTime())))
    .map((value) => value.getTime());
  return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
}

export async function evaluatePatientErasureEligibility(
  db: Db,
  patient: Document,
  now = new Date(),
  retentionYears = MINIMUM_CLINICAL_RETENTION_YEARS
) {
  if (patient.retention_legal_hold === true) {
    return { eligible: false as const, reason: 'legal-hold' as const, lastContact: null };
  }
  const lastContact = await getLastPatientContact(db, patient);
  const cutoff = subtractUtcYears(now, Math.max(MINIMUM_CLINICAL_RETENTION_YEARS, retentionYears));
  if (!lastContact || lastContact > cutoff) {
    return { eligible: false as const, reason: 'retention-period' as const, lastContact };
  }
  return { eligible: true as const, reason: null, lastContact };
}
