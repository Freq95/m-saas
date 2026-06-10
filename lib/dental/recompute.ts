import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow, type FlexDoc } from '@/lib/db/mongo-utils';
import type { CurrentIssue, ToothEventDoc } from '@/lib/server/dental';
import type { IssueType, Surface, ToothStatus } from '@/lib/dental/constants';

type Scope = { tenantId: ObjectId; userId: number; clientId: number };

/**
 * Rebuilds the tooth_state snapshot for a single tooth from its event history.
 * Called after any event insert/update/soft-delete so the snapshot stays consistent
 * with the append-only event log. Cheap because a single tooth rarely has more
 * than a handful of events.
 */
export async function recomputeToothState(
  scope: Scope,
  toothFdi: number,
  statusOverride?: ToothStatus
): Promise<void> {
  const db = await getMongoDbOrThrow();
  const { tenantId, userId, clientId } = scope;
  const now = new Date().toISOString();

  const events = (await db
    .collection('tooth_events')
    .find({
      tenant_id: tenantId,
      user_id: userId,
      client_id: clientId,
      tooth_fdi: toothFdi,
      deleted_at: { $exists: false },
    })
    .sort({ occurred_at: -1, created_at: -1 })
    .toArray()) as unknown as ToothEventDoc[];

  // Active issue per (issue_type) — driven by the latest event of that type that wasn't 'resolved'.
  const latestByType = new Map<IssueType, ToothEventDoc>();
  for (const event of events) {
    if (!latestByType.has(event.issue_type)) {
      latestByType.set(event.issue_type, event);
    }
  }

  const current_issues: CurrentIssue[] = [];
  for (const [type, event] of latestByType) {
    if (event.action === 'resolved') continue;
    current_issues.push({
      issue_type: type,
      surfaces: (event.surfaces ?? []) as Surface[],
      severity: event.severity,
      last_event_id: event.id,
    });
  }

  const last_manipulation_at = events.length > 0 ? events[0].occurred_at : null;

  const existing = await db.collection('tooth_states').findOne({
    tenant_id: tenantId,
    user_id: userId,
    client_id: clientId,
    tooth_fdi: toothFdi,
  });

  const status: ToothStatus = statusOverride ?? (existing?.status as ToothStatus) ?? 'present';

  if (existing) {
    await db.collection('tooth_states').updateOne(
      { _id: existing._id },
      {
        $set: {
          current_issues,
          status,
          last_manipulation_at,
          updated_at: now,
        },
      }
    );
    return;
  }

  // No prior state — insert. Use ObjectId for _id (no numeric counter needed for snapshot rows).
  const { getNextNumericId } = await import('@/lib/db/mongo-utils');
  const id = await getNextNumericId('tooth_states');
  await db.collection<FlexDoc>('tooth_states').insertOne({
    _id: id,
    id,
    tenant_id: tenantId,
    user_id: userId,
    client_id: clientId,
    tooth_fdi: toothFdi,
    status,
    current_issues,
    last_manipulation_at,
    created_at: now,
    updated_at: now,
  });
}
