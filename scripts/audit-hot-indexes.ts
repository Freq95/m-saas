import 'dotenv/config';
import { MongoClient, type Document } from 'mongodb';

const EXPECTED_INDEXES: Record<string, string[]> = {
  appointments: ['appointments_scope_time', 'appointments_calendar_time', 'appointments_client_owner_recent', 'appointments_client_service_owner_recent'],
  clients: ['clients_scope_last_activity', 'clients_scope_total_spent', 'clients_scope_created', 'clients_scope_id'],
  conversations: ['conversations_client_recent'],
  tooth_states: ['tooth_states_scope_client'],
  tooth_events: ['tooth_events_client_latest', 'tooth_events_tooth_latest'],
  surgery_groups: ['surgery_groups_scope_recent'],
  bridge_groups: ['bridge_groups_scope_recent'],
  treatment_plans: ['treatment_plans_scope_recent', 'treatment_plans_scope_id'],
  client_files: ['client_files_client_recent', 'client_files_client_id'],
  contact_files: ['contact_files_contact_recent', 'contact_files_contact_id'],
};

const INDEX_NAME_ALIASES: Record<string, string[]> = {
  client_files_client_recent: ['tenant_id_1_client_id_1_created_at_-1'],
};

function getDbName(uri: string) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try { return new URL(uri).pathname.replace(/^\//, '') || 'm-saas'; } catch { return 'm-saas'; }
}

function findIndexName(plan: Document | undefined): string | null {
  if (!plan || typeof plan !== 'object') return null;
  if (typeof plan.indexName === 'string') return plan.indexName;
  for (const value of Object.values(plan)) {
    if (value && typeof value === 'object') {
      const found = findIndexName(value as Document);
      if (found) return found;
    }
  }
  return null;
}

function summary(label: string, explain: Document) {
  const cursor = explain.stages?.[0]?.$cursor;
  const stats = explain.executionStats || cursor?.executionStats || {};
  const plan = explain.queryPlanner?.winningPlan || cursor?.queryPlanner?.winningPlan;
  return {
    query: label,
    index: findIndexName(plan),
    stage: plan?.stage || null,
    nReturned: stats.nReturned ?? null,
    totalKeysExamined: stats.totalKeysExamined ?? null,
    totalDocsExamined: stats.totalDocsExamined ?? null,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required.');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(getDbName(uri));

  try {
    const resolvedIndexNames = new Map<string, string>();
    for (const [collectionName, expected] of Object.entries(EXPECTED_INDEXES)) {
      const actual = new Set((await db.collection(collectionName).listIndexes().toArray()).map((index) => index.name));
      for (const name of expected) {
        const resolved = actual.has(name)
          ? name
          : INDEX_NAME_ALIASES[name]?.find((alias) => actual.has(alias));
        if (!resolved) throw new Error('Missing index ' + collectionName + '.' + name);
        resolvedIndexNames.set(name, resolved);
      }
    }

    const appointment = await db.collection('appointments').findOne({ tenant_id: { $exists: true }, user_id: { $type: 'number' }, calendar_id: { $type: 'number' } });
    const clientDoc = await db.collection('clients').findOne({ tenant_id: { $exists: true }, user_id: { $type: 'number' } });
    const dentalEvent = await db.collection('tooth_events').findOne({ tenant_id: { $exists: true }, user_id: { $type: 'number' }, client_id: { $type: 'number' } });
    const planDoc = await db.collection('treatment_plans').findOne({ tenant_id: { $exists: true }, user_id: { $type: 'number' }, client_id: { $type: 'number' } });
    const fileDoc = await db.collection('client_files').findOne({ tenant_id: { $exists: true }, client_id: { $type: 'number' } });
    const output: Document[] = [];
    const low = '2000-01-01T00:00:00.000Z';
    const high = '2100-01-01T00:00:00.000Z';

    if (appointment) {
      output.push(summary('dashboard appointments by owner/time', await db.collection('appointments')
        .find({ tenant_id: appointment.tenant_id, user_id: appointment.user_id, deleted_at: { $exists: false }, start_time: { $gte: low, $lte: high } })
        .hint(resolvedIndexNames.get('appointments_scope_time')!).limit(20).explain('executionStats')));
      output.push(summary('dashboard appointments by calendar/time', await db.collection('appointments')
        .find({ tenant_id: appointment.tenant_id, calendar_id: appointment.calendar_id, deleted_at: { $exists: false }, start_time: { $gte: low, $lte: high } })
        .hint(resolvedIndexNames.get('appointments_calendar_time')!).limit(20).explain('executionStats')));
    }

    if (clientDoc) {
      output.push(summary('clients default list', await db.collection('clients')
        .find({ tenant_id: clientDoc.tenant_id, user_id: clientDoc.user_id, deleted_at: { $exists: false } })
        .sort({ last_activity_date: -1 }).hint(resolvedIndexNames.get('clients_scope_last_activity')!).limit(20).explain('executionStats')));
    }

    if (dentalEvent) {
      const pipeline = [
        { $match: { tenant_id: dentalEvent.tenant_id, user_id: dentalEvent.user_id, client_id: dentalEvent.client_id, deleted_at: { $exists: false } } },
        { $sort: { occurred_at: -1 as const, created_at: -1 as const } },
        { $group: { _id: '$tooth_fdi', event: { $first: '$$ROOT' } } },
      ];
      output.push(summary('dental latest event per tooth', await db.collection('tooth_events')
        .aggregate(pipeline, { hint: resolvedIndexNames.get('tooth_events_client_latest')! }).explain('executionStats')));
    }

    if (planDoc) {
      output.push(summary('treatment plans recent list', await db.collection('treatment_plans')
        .find({ tenant_id: planDoc.tenant_id, user_id: planDoc.user_id, client_id: planDoc.client_id, deleted_at: { $exists: false } })
        .sort({ created_at: -1 }).hint(resolvedIndexNames.get('treatment_plans_scope_recent')!).limit(20).explain('executionStats')));
    }

    if (fileDoc) {
      output.push(summary('client files recent list', await db.collection('client_files')
        .find({ tenant_id: fileDoc.tenant_id, client_id: fileDoc.client_id })
        .sort({ created_at: -1 }).hint(resolvedIndexNames.get('client_files_client_recent')!).limit(20).explain('executionStats')));
    }

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
