import 'dotenv/config';
import { getMongoDbOrThrow } from '../lib/db/mongo-utils';

function sameIndexKey(left: Record<string, unknown>, right: Record<string, unknown>) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function ensureNamedIndex(
  db: Awaited<ReturnType<typeof getMongoDbOrThrow>>,
  collectionName: string,
  keys: Record<string, 1 | -1>,
  options: { name: string }
) {
  const collection = db.collection(collectionName);
  const existing = await collection.listIndexes().toArray();
  if (existing.some((index) => sameIndexKey(index.key, keys))) return;
  await collection.createIndex(keys, options);
}

async function createTenantIndexes() {
  const db = await getMongoDbOrThrow();

  await db.collection('appointments').createIndex({ tenant_id: 1, start_time: -1 });
  await db.collection('appointments').createIndex({ tenant_id: 1, client_id: 1 });
  await db.collection('appointments').createIndex({ tenant_id: 1, calendar_id: 1, start_time: 1 });
  await db.collection('appointments').createIndex({ tenant_id: 1, status: 1 });

  await db.collection('clients').createIndex({ tenant_id: 1, status: 1 });
  await db.collection('clients').createIndex({ tenant_id: 1, email: 1 });
  await db.collection('clients').createIndex({ tenant_id: 1, name: 1 });
  await db.collection('clients').createIndex({ tenant_id: 1, created_at: -1 });
  await db.collection('clients').createIndex({ tenant_id: 1, user_id: 1, deleted_at: 1 });

  await db.collection('conversations').createIndex({ tenant_id: 1, updated_at: -1 });
  await db.collection('conversations').createIndex({ tenant_id: 1, channel: 1 });
  await db.collection('conversations').createIndex({ tenant_id: 1, user_id: 1, created_at: -1 });
  await db.collection('conversations').createIndex({ tenant_id: 1, client_id: 1 });

  await db.collection('messages').createIndex({ tenant_id: 1, conversation_id: 1, created_at: -1 });

  await db.collection('message_attachments').createIndex({ tenant_id: 1, conversation_id: 1 });
  await db.collection('conversation_tags').createIndex({ conversation_id: 1 });

  await db.collection('services').createIndex({ tenant_id: 1, is_active: 1 });
  await db.collection('tasks').createIndex({ tenant_id: 1, status: 1, due_date: 1 });
  await db.collection('reminders').createIndex({ tenant_id: 1, status: 1, scheduled_at: 1 });

  await ensureNamedIndex(db, 'appointments',
    { tenant_id: 1, user_id: 1, deleted_at: 1, start_time: 1 },
    { name: 'appointments_scope_time' }
  );
  await ensureNamedIndex(db, 'appointments',
    { tenant_id: 1, calendar_id: 1, deleted_at: 1, start_time: 1 },
    { name: 'appointments_calendar_time' }
  );
  await ensureNamedIndex(db, 'appointments',
    { tenant_id: 1, user_id: 1, client_id: 1, deleted_at: 1, start_time: -1 },
    { name: 'appointments_client_owner_recent' }
  );
  await ensureNamedIndex(db, 'appointments',
    { service_owner_tenant_id: 1, service_owner_user_id: 1, client_id: 1, deleted_at: 1, start_time: -1 },
    { name: 'appointments_client_service_owner_recent' }
  );

  await ensureNamedIndex(db, 'clients',
    { tenant_id: 1, user_id: 1, deleted_at: 1, last_activity_date: -1 },
    { name: 'clients_scope_last_activity' }
  );
  await ensureNamedIndex(db, 'clients',
    { tenant_id: 1, user_id: 1, deleted_at: 1, total_spent: -1 },
    { name: 'clients_scope_total_spent' }
  );
  await ensureNamedIndex(db, 'clients',
    { tenant_id: 1, user_id: 1, deleted_at: 1, created_at: -1 },
    { name: 'clients_scope_created' }
  );
  await ensureNamedIndex(db, 'clients',
    { tenant_id: 1, user_id: 1, id: 1, deleted_at: 1 },
    { name: 'clients_scope_id' }
  );

  await ensureNamedIndex(db, 'conversations',
    { tenant_id: 1, user_id: 1, client_id: 1, updated_at: -1 },
    { name: 'conversations_client_recent' }
  );

  await ensureNamedIndex(db, 'tooth_states',
    { tenant_id: 1, user_id: 1, client_id: 1, tooth_fdi: 1 },
    { name: 'tooth_states_scope_client' }
  );
  await ensureNamedIndex(db, 'tooth_events',
    { tenant_id: 1, user_id: 1, client_id: 1, deleted_at: 1, occurred_at: -1, created_at: -1, tooth_fdi: 1 },
    { name: 'tooth_events_client_latest' }
  );
  await ensureNamedIndex(db, 'tooth_events',
    { tenant_id: 1, user_id: 1, client_id: 1, tooth_fdi: 1, deleted_at: 1, occurred_at: -1, created_at: -1 },
    { name: 'tooth_events_tooth_latest' }
  );
  await ensureNamedIndex(db, 'surgery_groups',
    { tenant_id: 1, user_id: 1, client_id: 1, created_at: -1 },
    { name: 'surgery_groups_scope_recent' }
  );
  await ensureNamedIndex(db, 'bridge_groups',
    { tenant_id: 1, user_id: 1, client_id: 1, created_at: -1 },
    { name: 'bridge_groups_scope_recent' }
  );

  await ensureNamedIndex(db, 'treatment_plans',
    { tenant_id: 1, user_id: 1, client_id: 1, deleted_at: 1, created_at: -1 },
    { name: 'treatment_plans_scope_recent' }
  );
  await ensureNamedIndex(db, 'treatment_plans',
    { tenant_id: 1, user_id: 1, client_id: 1, id: 1, deleted_at: 1 },
    { name: 'treatment_plans_scope_id' }
  );

  await ensureNamedIndex(db, 'client_files',
    { tenant_id: 1, client_id: 1, created_at: -1 },
    { name: 'client_files_client_recent' }
  );
  await ensureNamedIndex(db, 'client_files',
    { tenant_id: 1, client_id: 1, id: 1 },
    { name: 'client_files_client_id' }
  );
  await ensureNamedIndex(db, 'contact_files',
    { tenant_id: 1, contact_id: 1, created_at: -1 },
    { name: 'contact_files_contact_recent' }
  );
  await ensureNamedIndex(db, 'contact_files',
    { tenant_id: 1, contact_id: 1, id: 1 },
    { name: 'contact_files_contact_id' }
  );

  await db.collection('email_integrations').createIndex(
    { user_id: 1, provider: 1 },
    { unique: true }
  );
  // Cleanup legacy per-tenant unique index if present.
  try {
    await db.collection('email_integrations').dropIndex('tenant_id_1_provider_1');
  } catch {
    // ignore if already removed
  }

  await db.collection('client_files').createIndex({ tenant_id: 1, client_id: 1 });

  await db.collection('treatment_plan_public_links').createIndex(
    { token_hash: 1 },
    { unique: true, name: 'treatment_plan_public_links_token_hash' }
  );
  await db.collection('treatment_plan_public_links').createIndex(
    { tenant_id: 1, user_id: 1, client_id: 1, plan_id: 1, revoked_at: 1, expires_at: 1 },
    { name: 'treatment_plan_public_links_by_plan_active' }
  );
  await db.collection('treatment_plan_public_links').createIndex(
    { expires_at_date: 1 },
    { expireAfterSeconds: 0, name: 'treatment_plan_public_links_expires_at_ttl' }
  );

  console.log('Tenant indexes created.');
}

createTenantIndexes()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
