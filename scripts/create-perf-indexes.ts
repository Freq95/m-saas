import 'dotenv/config';
import type { Db, IndexDirection } from 'mongodb';
import { getMongoDbOrThrow } from '../lib/db/mongo-utils';

/**
 * Performance indexes optimized for queries that filter by user_id first.
 * Run once against production: `npx tsx scripts/create-perf-indexes.ts`
 *
 * Complements scripts/create-tenant-indexes.ts (which is tenant_id-first).
 *
 * Safely idempotent: if an equivalent index already exists under a different
 * name, the conflict is logged and the script continues.
 */

type IndexSpec = Record<string, IndexDirection | 'text'>;

async function ensureIndex(
  db: Db,
  collection: string,
  spec: IndexSpec,
  options: Parameters<Db['collection']>[0] extends string
    ? Parameters<ReturnType<Db['collection']>['createIndex']>[1]
    : never,
): Promise<void> {
  try {
    const name = await db.collection(collection).createIndex(spec, options);
    console.log(`  ✓ ${collection}.${name}`);
  } catch (err: unknown) {
    const e = err as { code?: number; codeName?: string; message?: string };
    // 85 = IndexOptionsConflict (same key, different options/name)
    // 86 = IndexKeySpecsConflict (same name, different key)
    if (e.code === 85 || e.code === 86) {
      console.log(`  ~ ${collection}.${(options as { name?: string })?.name ?? '<unnamed>'} skipped (${e.message})`);
      return;
    }
    throw err;
  }
}

async function createPerfIndexes() {
  const db = await getMongoDbOrThrow();

  // appointments: dashboard, calendar, client profile all filter by (user_id, tenant_id) + date range
  await ensureIndex(db, 'appointments',
    { user_id: 1, tenant_id: 1, start_time: 1 },
    { name: 'perf_appts_user_tenant_start' });
  await ensureIndex(db, 'appointments',
    { user_id: 1, tenant_id: 1, deleted_at: 1, start_time: 1 },
    { name: 'perf_appts_user_tenant_active_start' });
  await ensureIndex(db, 'appointments',
    { calendar_id: 1, start_time: 1 },
    { name: 'perf_appts_calendar_start' });

  // clients: paginated list sorts by last_activity_date / total_spent / name; always filters by (user_id, tenant_id)
  await ensureIndex(db, 'clients',
    { user_id: 1, tenant_id: 1, deleted_at: 1, last_activity_date: -1 },
    { name: 'perf_clients_user_tenant_active_activity' });
  await ensureIndex(db, 'clients',
    { user_id: 1, tenant_id: 1, deleted_at: 1, total_spent: -1 },
    { name: 'perf_clients_user_tenant_active_spent' });
  await ensureIndex(db, 'clients',
    { user_id: 1, tenant_id: 1, deleted_at: 1, name: 1 },
    { name: 'perf_clients_user_tenant_active_name' });

  // clients: text index for case-insensitive search across name/email/phone.
  // Only one text index allowed per collection; drop any prior one we own.
  try {
    await db.collection('clients').dropIndex('perf_clients_text');
  } catch {
    // ignore if absent
  }
  await ensureIndex(db, 'clients',
    { name: 'text', email: 'text', phone: 'text' },
    {
      name: 'perf_clients_text',
      default_language: 'none',
      weights: { name: 10, email: 5, phone: 3 },
    });

  // conversations: inbox sorts by user_id + last_message_at
  await ensureIndex(db, 'conversations',
    { user_id: 1, tenant_id: 1, last_message_at: -1 },
    { name: 'perf_conv_user_tenant_lastmsg' });

  // team_members: auth-context query
  await ensureIndex(db, 'team_members',
    { user_id: 1, tenant_id: 1 },
    { name: 'perf_team_user_tenant' });

  // tenants: admin stats sort by created_at desc
  await ensureIndex(db, 'tenants',
    { created_at: -1 },
    { name: 'perf_tenants_created' });

  console.log('Performance indexes ensured.');
}

createPerfIndexes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
