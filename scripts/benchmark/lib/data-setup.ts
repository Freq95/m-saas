import bcrypt from 'bcryptjs';
import { MongoClient, ObjectId } from 'mongodb';
import { DataSetupResult, BenchmarkConfig } from './types';

type UserSpec = {
  id: number;
  email: string;
  name: string;
  role: 'owner' | 'staff';
  password: string;
};

const OWNER_A_BASE = {
  id: 910001,
  name: 'Owner A',
  role: 'owner',
};

const OWNER_B_BASE = {
  id: 910002,
  name: 'Owner B',
  role: 'owner',
};

const STAFF_A_BASE = {
  id: 910003,
  name: 'Staff A',
  role: 'staff',
};

async function getNextNumericId(db: any, collectionName: string): Promise<number> {
  const doc = await db.collection(collectionName).find({ id: { $type: 'number' } }).sort({ id: -1 }).limit(1).next();
  return (doc?.id || 0) + 1;
}

async function ensureTenant(db: any, name: string, slug: string): Promise<ObjectId> {
  const nowIso = new Date().toISOString();
  const existing = await db.collection('tenants').findOne({ slug });
  if (existing?._id) {
    return existing._id as ObjectId;
  }
  const insert = await db.collection('tenants').insertOne({
    name,
    slug,
    owner_id: null,
    plan: 'free',
    status: 'active',
    max_seats: 500,
    settings: { timezone: 'Europe/Bucharest', currency: 'RON' },
    created_at: nowIso,
    updated_at: nowIso,
  });
  return insert.insertedId;
}

async function ensureUser(db: any, tenantId: ObjectId, spec: UserSpec): Promise<ObjectId> {
  const nowIso = new Date().toISOString();
  const passwordHash = await bcrypt.hash(spec.password, 12);

  let user = await db.collection('users').findOne({ email: spec.email, tenant_id: tenantId });
  if (!user) {
    const insert = await db.collection('users').insertOne({
      id: spec.id,
      email: spec.email,
      password_hash: passwordHash,
      name: spec.name,
      role: spec.role,
      tenant_id: tenantId,
      status: 'active',
      created_at: nowIso,
      updated_at: nowIso,
      source: 'benchmark',
    });
    user = { _id: insert.insertedId };
  } else {
    await db.collection('users').updateOne(
      { _id: user._id },
      {
        $set: {
          id: spec.id,
          password_hash: passwordHash,
          name: spec.name,
          role: spec.role,
          status: 'active',
          tenant_id: tenantId,
          updated_at: nowIso,
          source: 'benchmark',
        },
      }
    );
  }

  await db.collection('team_members').updateOne(
    { tenant_id: tenantId, user_id: user._id },
    {
      $set: {
        tenant_id: tenantId,
        user_id: user._id,
        email: spec.email,
        role: spec.role,
        status: 'active',
        accepted_at: nowIso,
        updated_at: nowIso,
      },
      $setOnInsert: {
        invited_by: user._id,
        invited_at: nowIso,
        created_at: nowIso,
      },
    },
    { upsert: true }
  );

  return user._id as ObjectId;
}

async function ensureServices(db: any, tenantId: ObjectId, ownerAId: number, minimum: number) {
  const count = await db.collection('services').countDocuments({ tenant_id: tenantId });
  const nowIso = new Date().toISOString();
  for (let i = count; i < minimum; i++) {
    const id = await getNextNumericId(db, 'services');
    await db.collection('services').insertOne({
      _id: id,
      id,
      tenant_id: tenantId,
      user_id: ownerAId,
      name: `Benchmark Service ${id}`,
      duration_minutes: 60,
      price: 150,
      description: 'Benchmark fixture',
      is_active: true,
      created_at: nowIso,
      updated_at: nowIso,
      source: 'benchmark',
    });
  }
}

async function ensureClients(db: any, tenantId: ObjectId, ownerAId: number, minimum: number) {
  const count = await db.collection('clients').countDocuments({ tenant_id: tenantId, deleted_at: { $exists: false } });
  const nowIso = new Date().toISOString();
  for (let i = count; i < minimum; i++) {
    const id = await getNextNumericId(db, 'clients');
    await db.collection('clients').insertOne({
      _id: id,
      id,
      tenant_id: tenantId,
      user_id: ownerAId,
      name: `Benchmark Client ${id}`,
      email: `benchmark.client.${id}@example.com`,
      phone: `07${String(10000000 + id).slice(-8)}`,
      notes: null,
      total_spent: 0,
      total_appointments: 0,
      last_appointment_date: null,
      last_conversation_date: null,
      first_contact_date: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
      last_activity_date: nowIso,
      source: 'benchmark',
    });
  }
}

async function ensureConversationsAndMessages(
  db: any,
  tenantId: ObjectId,
  ownerAId: number,
  minimumConversations: number,
  minimumMessages: number
) {
  const convCount = await db.collection('conversations').countDocuments({ tenant_id: tenantId });
  const nowIso = new Date().toISOString();
  for (let i = convCount; i < minimumConversations; i++) {
    const id = await getNextNumericId(db, 'conversations');
    await db.collection('conversations').insertOne({
      _id: id,
      id,
      tenant_id: tenantId,
      user_id: ownerAId,
      channel: 'email',
      channel_id: '',
      contact_name: `Benchmark Contact ${id}`,
      contact_email: `benchmark.contact.${id}@example.com`,
      subject: `Benchmark Conversation ${id}`,
      created_at: nowIso,
      updated_at: nowIso,
      source: 'benchmark',
    });
  }

  const allConversationIds: number[] = (await db.collection('conversations')
    .find({ tenant_id: tenantId }, { projection: { id: 1 } })
    .toArray()).map((c: any) => c.id);

  const msgCount = await db.collection('messages').countDocuments({ tenant_id: tenantId });
  for (let i = msgCount; i < minimumMessages; i++) {
    const id = await getNextNumericId(db, 'messages');
    const conversationId = allConversationIds[i % allConversationIds.length];
    await db.collection('messages').insertOne({
      _id: id,
      id,
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: i % 2 === 0 ? 'inbound' : 'outbound',
      content: `Benchmark message ${id}`,
      is_read: false,
      sent_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
      source: 'benchmark',
    });
  }
}

async function ensureAppointments(db: any, tenantId: ObjectId, ownerAId: number, minimum: number) {
  const count = await db.collection('appointments').countDocuments({ tenant_id: tenantId });
  const clients = await db.collection('clients').find({ tenant_id: tenantId }, { projection: { id: 1, name: 1, email: 1, phone: 1 } }).toArray();
  const services = await db.collection('services').find({ tenant_id: tenantId }, { projection: { id: 1 } }).toArray();
  const now = new Date();

  for (let i = count; i < minimum; i++) {
    const id = await getNextNumericId(db, 'appointments');
    const client = clients[i % clients.length];
    const service = services[i % services.length];
    const start = new Date(now.getTime() + (i % 30) * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const nowIso = new Date().toISOString();

    await db.collection('appointments').insertOne({
      _id: id,
      id,
      tenant_id: tenantId,
      user_id: ownerAId,
      service_id: service.id,
      client_id: client.id,
      client_name: client.name,
      client_email: client.email || null,
      client_phone: client.phone || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: 'scheduled',
      reminder_sent: false,
      created_at: nowIso,
      updated_at: nowIso,
      source: 'benchmark',
    });
  }
}

export async function ensureBenchmarkData(config: BenchmarkConfig): Promise<DataSetupResult> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required for benchmark data setup');
  }
  const dbName = process.env.MONGODB_DB || 'm-saas';
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  try {
    const tenantAId = await ensureTenant(db, config.dataSetup.tenantA.name, config.dataSetup.tenantA.slug);
    const tenantBId = await ensureTenant(db, config.dataSetup.tenantB.name, config.dataSetup.tenantB.slug);

    const ownerAUserId = await ensureUser(db, tenantAId, {
      ...OWNER_A_BASE,
      email: config.authUsers.ownerA.email,
      password: config.authUsers.ownerA.password,
    } as UserSpec);
    const ownerBUserId = await ensureUser(db, tenantBId, {
      ...OWNER_B_BASE,
      email: config.authUsers.ownerB.email,
      password: config.authUsers.ownerB.password,
    } as UserSpec);
    const staffAUserId = await ensureUser(db, tenantAId, {
      ...STAFF_A_BASE,
      email: config.authUsers.staffA.email,
      password: config.authUsers.staffA.password,
    } as UserSpec);

    await db.collection('tenants').updateOne(
      { _id: tenantAId },
      { $set: { owner_id: ownerAUserId, max_seats: Math.max(500, config.dataSetup.minimums.clients), updated_at: new Date().toISOString() } }
    );
    await db.collection('tenants').updateOne(
      { _id: tenantBId },
      { $set: { owner_id: ownerBUserId, updated_at: new Date().toISOString() } }
    );

    await ensureServices(db, tenantAId, OWNER_A_BASE.id, config.dataSetup.minimums.services);
    await ensureClients(db, tenantAId, OWNER_A_BASE.id, config.dataSetup.minimums.clients);
    await ensureConversationsAndMessages(
      db,
      tenantAId,
      OWNER_A_BASE.id,
      config.dataSetup.minimums.conversations,
      config.dataSetup.minimums.messages
    );
    await ensureAppointments(db, tenantAId, OWNER_A_BASE.id, config.dataSetup.minimums.appointments);

    return {
      tenantAId,
      tenantBId,
      ownerAUserId,
      ownerBUserId,
      staffAUserId,
    };
  } finally {
    await client.close();
  }
}
