import type { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { logger } from '@/lib/logger';

export type AuditAction =
  | 'tenant.create'
  | 'tenant.update'
  | 'tenant.suspend'
  | 'tenant.soft_delete'
  | 'tenant.restore'
  | 'tenant.user.add'
  | 'tenant.invite.resend'
  | 'user.update'
  | 'user.soft_delete'
  | 'user.restore'
  | 'incident.create'
  | 'incident.update';

export interface AdminAuditEntryInput {
  action: AuditAction;
  actorUserId: ObjectId | string;
  actorEmail: string;
  targetType: 'tenant' | 'user' | 'incident';
  targetId: ObjectId | string;
  request?: NextRequest;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

export interface DataAccessEntryInput {
  actorUserId: ObjectId | string;
  actorEmail?: string | null;
  actorRole?: string | null;
  tenantId?: ObjectId | string | null;
  targetType: string;
  targetId?: ObjectId | string | number | null;
  route: string;
  request?: NextRequest;
  metadata?: Record<string, unknown> | null;
}

let indexesEnsured = false;

async function ensureIndexes() {
  if (indexesEnsured) return;
  const db = await getMongoDbOrThrow();
  await Promise.all([
    db.collection('audit_logs').createIndex({ created_at: -1 }),
    db.collection('audit_logs').createIndex({ action: 1, created_at: -1 }),
    db.collection('audit_logs').createIndex({ actor_user_id: 1, created_at: -1 }),
    db.collection('audit_logs').createIndex({ target_type: 1, target_id: 1, created_at: -1 }),
    db.collection('data_access_logs').createIndex({ created_at: -1 }),
    db.collection('data_access_logs').createIndex({ actor_user_id: 1, created_at: -1 }),
    db.collection('data_access_logs').createIndex({ tenant_id: 1, created_at: -1 }),
    db.collection('data_access_logs').createIndex({ route: 1, created_at: -1 }),
    db.collection('data_access_logs').createIndex({ target_type: 1, target_id: 1, created_at: -1 }),
  ]);
  indexesEnsured = true;
}

function toMongoIdentifier(value: ObjectId | string | number | null | undefined): ObjectId | string | number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }
  return value;
}

export async function logAdminAudit(input: AdminAuditEntryInput): Promise<void> {
  try {
    await ensureIndexes();
    const db = await getMongoDbOrThrow();

    const ip =
      input.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      input.request?.headers.get('x-real-ip') ||
      null;
    const userAgent = input.request?.headers.get('user-agent') || null;

    await db.collection('audit_logs').insertOne({
      _id: new ObjectId(),
      action: input.action,
      actor_user_id: toMongoIdentifier(input.actorUserId),
      actor_email: input.actorEmail,
      target_type: input.targetType,
      target_id: toMongoIdentifier(input.targetId),
      ip,
      user_agent: userAgent,
      before: input.before ?? null,
      after: input.after ?? null,
      metadata: input.metadata ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn('[AUDIT] Failed to write audit log', { error });
  }
}

export async function logDataAccess(input: DataAccessEntryInput): Promise<void> {
  try {
    await ensureIndexes();
    const db = await getMongoDbOrThrow();

    const ip =
      input.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      input.request?.headers.get('x-real-ip') ||
      null;
    const userAgent = input.request?.headers.get('user-agent') || null;

    await db.collection('data_access_logs').insertOne({
      _id: new ObjectId(),
      actor_user_id: toMongoIdentifier(input.actorUserId),
      actor_email: input.actorEmail ?? null,
      actor_role: input.actorRole ?? null,
      tenant_id: toMongoIdentifier(input.tenantId ?? null),
      method: input.request?.method || 'GET',
      route: input.route,
      target_type: input.targetType,
      target_id: toMongoIdentifier(input.targetId),
      ip,
      user_agent: userAgent,
      metadata: input.metadata ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn('[AUDIT] Failed to write data access log', { error });
  }
}
