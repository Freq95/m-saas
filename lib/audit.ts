import type { NextRequest } from 'next/server';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

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
  | 'user.restore';

export interface AdminAuditEntryInput {
  action: AuditAction;
  actorUserId: ObjectId | string;
  actorEmail: string;
  targetType: 'tenant' | 'user';
  targetId: ObjectId | string;
  request?: NextRequest;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
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
  ]);
  indexesEnsured = true;
}

function toObjectIdMaybe(value: ObjectId | string): ObjectId | string {
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
      actor_user_id: toObjectIdMaybe(input.actorUserId),
      actor_email: input.actorEmail,
      target_type: input.targetType,
      target_id: toObjectIdMaybe(input.targetId),
      ip,
      user_agent: userAgent,
      before: input.before ?? null,
      after: input.after ?? null,
      metadata: input.metadata ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[AUDIT] Failed to write audit log', error);
  }
}
