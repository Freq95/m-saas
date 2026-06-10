import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import {
  ISSUE_TYPES,
  type IssueType,
  type Surface,
  type ToothStatus,
  type EventAction,
  type Severity,
} from '@/lib/dental/constants';
import { listSurgeryGroups, type SurgeryGroupDoc } from '@/lib/server/surgery';
import { listBridgeGroups, type BridgeGroupDoc } from '@/lib/server/bridges';

export type CurrentIssue = {
  issue_type: IssueType;
  surfaces: Surface[];
  severity?: Severity;
  last_event_id: number;
};

export type ToothStateDoc = {
  id: number;
  client_id: number;
  tenant_id: ObjectId;
  user_id: number;
  tooth_fdi: number;
  status: ToothStatus;
  current_issues: CurrentIssue[];
  last_manipulation_at: string | null;
  updated_at: string;
  created_at: string;
};

export type ToothEventDoc = {
  id: number;
  client_id: number;
  tenant_id: ObjectId;
  user_id: number;
  tooth_fdi: number;
  surfaces: Surface[];
  issue_type: IssueType;
  action: EventAction;
  severity?: Severity;
  doctor_user_id: number;
  doctor_name_snapshot: string;
  occurred_at: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  deleted_at?: string;
};

export type IssueDistribution = Array<{
  type: IssueType;
  count: number;
  percent: number;
}>;

export type DentalData = {
  tooth_states: ToothStateDoc[];
  latest_event_by_tooth: Record<number, ToothEventDoc>;
  surgery_groups: SurgeryGroupDoc[];
  bridge_groups: BridgeGroupDoc[];
  aggregates: {
    by_issue: IssueDistribution;
    total_issues: number;
  };
};

const TOOTH_COUNT = 32;

/** Loads the full odontogram snapshot for a client, plus the latest event for each affected tooth. */
export async function getDentalData(
  clientId: number,
  tenantId: ObjectId,
  userId: number
): Promise<DentalData> {
  const db = await getMongoDbOrThrow();

  const stateScope = { tenant_id: tenantId, client_id: clientId, user_id: userId };
  const eventScope = {
    tenant_id: tenantId,
    client_id: clientId,
    user_id: userId,
    deleted_at: { $exists: false },
  };

  const [states, eventLatest, surgery_groups, bridge_groups] = await Promise.all([
    db.collection('tooth_states').find(stateScope).toArray(),
    db
      .collection('tooth_events')
      .aggregate([
        { $match: eventScope },
        { $sort: { occurred_at: -1, created_at: -1 } },
        {
          $group: {
            _id: '$tooth_fdi',
            event: { $first: '$$ROOT' },
          },
        },
      ])
      .toArray(),
    listSurgeryGroups({ tenantId, userId, clientId }),
    listBridgeGroups({ tenantId, userId, clientId }),
  ]);

  const tooth_states = states.map((doc: any) => stripMongoId(doc) as ToothStateDoc);
  const latest_event_by_tooth: Record<number, ToothEventDoc> = {};
  for (const row of eventLatest) {
    const event = stripMongoId(row.event) as ToothEventDoc;
    latest_event_by_tooth[event.tooth_fdi] = event;
  }

  // Aggregate active issues by type — percent of teeth affected (capped at total tooth count).
  const issueCounts = new Map<IssueType, number>();
  for (const state of tooth_states) {
    for (const issue of state.current_issues ?? []) {
      issueCounts.set(issue.issue_type, (issueCounts.get(issue.issue_type) || 0) + 1);
    }
  }
  const total_issues = Array.from(issueCounts.values()).reduce((a, b) => a + b, 0);
  const by_issue: IssueDistribution = ISSUE_TYPES.map((type) => {
    const count = issueCounts.get(type) || 0;
    return {
      type,
      count,
      percent: Math.round((count / TOOTH_COUNT) * 1000) / 10,
    };
  });

  return {
    tooth_states,
    latest_event_by_tooth,
    surgery_groups,
    bridge_groups,
    aggregates: { by_issue, total_issues },
  };
}
