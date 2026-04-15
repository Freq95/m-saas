require('dotenv').config();
const { MongoClient } = require('mongodb');

const DEFAULT_DB_NAME = 'm-saas';
const DEFAULT_PERSONAL_CALENDAR_NAME = 'Calendarul meu';
const DEFAULT_PERSONAL_CALENDAR_COLOR = '#2563eb';

function getDbName(uri) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try {
    const url = new URL(uri);
    const dbName = url.pathname ? url.pathname.replace(/^\//, '') : '';
    if (dbName) return dbName;
  } catch {
    // ignore
  }
  return DEFAULT_DB_NAME;
}

async function getNextNumericId(db, collectionName, idField = 'id') {
  const collection = db.collection(collectionName);
  const counters = db.collection('counters');

  const doc = await collection
    .find({ [idField]: { $type: 'number' } })
    .sort({ [idField]: -1 })
    .limit(1)
    .next();

  const maxId = doc?.[idField];
  const currentMax =
    typeof maxId === 'number'
      ? maxId
      : typeof doc?._id === 'number'
        ? doc._id
        : 0;

  const counterKey = `${collectionName}:${idField}`;
  const nowIso = new Date().toISOString();

  await counters.updateOne(
    { _id: counterKey },
    {
      $setOnInsert: {
        seq: currentMax,
        created_at: nowIso,
      },
    },
    { upsert: true }
  );

  await counters.updateOne(
    { _id: counterKey },
    {
      $max: { seq: currentMax },
      $set: { updated_at: nowIso },
    }
  );

  const result = await counters.findOneAndUpdate(
    { _id: counterKey },
    {
      $inc: { seq: 1 },
      $set: { updated_at: new Date().toISOString() },
    },
    {
      upsert: true,
      returnDocument: 'after',
    }
  );

  const value = result?.value ?? result;
  if (typeof value?.seq === 'number') {
    return value.seq;
  }

  return 1;
}

async function ensureCollections(db) {
  const existing = await db.listCollections({}, { nameOnly: true }).toArray();
  const existingNames = new Set(existing.map((collection) => collection.name));

  for (const name of ['calendars', 'calendar_shares']) {
    if (!existingNames.has(name)) {
      await db.createCollection(name);
    }
  }
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection('calendars').createIndex(
      { tenant_id: 1, owner_user_id: 1, is_active: 1 },
      { name: 'calendars_tenant_owner_active' }
    ),
    db.collection('calendars').createIndex(
      { tenant_id: 1, resource_id: 1 },
      { name: 'calendars_tenant_resource' }
    ),
    db.collection('calendars').createIndex(
      { tenant_id: 1, owner_user_id: 1 },
      {
        name: 'calendars_single_default_per_owner',
        unique: true,
        partialFilterExpression: {
          is_default: true,
          is_active: true,
        },
      }
    ),
    db.collection('calendar_shares').createIndex(
      { calendar_id: 1, status: 1 },
      { name: 'calendar_shares_calendar_status' }
    ),
    db.collection('calendar_shares').createIndex(
      { shared_with_user_id: 1, status: 1 },
      { name: 'calendar_shares_shared_user_status' }
    ),
    db.collection('calendar_shares').createIndex(
      { shared_with_email: 1, status: 1 },
      { name: 'calendar_shares_shared_email_status' }
    ),
    db.collection('calendar_shares').createIndex(
      { invite_token_hash: 1 },
      {
        name: 'calendar_shares_invite_token_hash',
        unique: true,
        partialFilterExpression: { invite_token_hash: { $type: 'string' } },
      }
    ),
    db.collection('calendar_shares').createIndex(
      { calendar_id: 1, shared_with_email: 1 },
      {
        name: 'calendar_shares_active_share_per_email',
        unique: true,
        partialFilterExpression: {
          $or: [{ status: 'pending' }, { status: 'accepted' }],
        },
      }
    ),
    db.collection('calendar_shares').createIndex(
      { expires_at: 1 },
      {
        name: 'calendar_shares_expires_at_ttl',
        expireAfterSeconds: 0,
      }
    ),
    db.collection('appointments').createIndex(
      { calendar_id: 1, start_time: 1 },
      { name: 'appointments_calendar_start_time' }
    ),
  ]);
}

async function backfillDefaultCalendars(db) {
  const appointments = db.collection('appointments');
  const users = db.collection('users');
  const calendars = db.collection('calendars');

  const ownerPairs = await appointments.aggregate([
    {
      $match: {
        tenant_id: { $type: 'objectId' },
        user_id: { $type: 'number' },
      },
    },
    {
      $group: {
        _id: {
          tenant_id: '$tenant_id',
          user_id: '$user_id',
        },
      },
    },
  ]).toArray();

  let createdCalendars = 0;
  let assignedAppointments = 0;
  let backfilledCreators = 0;
  let skippedPairs = 0;

  for (const pair of ownerPairs) {
    const tenantId = pair?._id?.tenant_id;
    const userId = pair?._id?.user_id;
    if (!tenantId || typeof userId !== 'number') {
      skippedPairs += 1;
      continue;
    }

    const user = await users.findOne({
      tenant_id: tenantId,
      id: userId,
    });

    let defaultCalendar = await calendars.findOne({
      tenant_id: tenantId,
      owner_user_id: userId,
      is_default: true,
      is_active: true,
      deleted_at: { $exists: false },
    });

    if (!defaultCalendar) {
      if (!user?._id) {
        console.warn(`Skipping default calendar backfill for tenant=${tenantId.toString()} user_id=${userId}: user not found.`);
        skippedPairs += 1;
        continue;
      }

      const calendarId = await getNextNumericId(db, 'calendars');
      const now = new Date().toISOString();
      defaultCalendar = {
        _id: calendarId,
        id: calendarId,
        tenant_id: tenantId,
        owner_user_id: userId,
        owner_db_user_id: user._id,
        name: DEFAULT_PERSONAL_CALENDAR_NAME,
        type: 'personal',
        resource_id: null,
        color: DEFAULT_PERSONAL_CALENDAR_COLOR,
        is_default: true,
        is_active: true,
        settings: {
          color_mode: 'category',
        },
        created_at: now,
        updated_at: now,
      };

      try {
        await calendars.insertOne(defaultCalendar);
        createdCalendars += 1;
      } catch (error) {
        if (error?.code === 11000) {
          defaultCalendar = await calendars.findOne({
            tenant_id: tenantId,
            owner_user_id: userId,
            is_default: true,
            is_active: true,
            deleted_at: { $exists: false },
          });
        } else {
          throw error;
        }
      }
    } else if (user?._id && (!defaultCalendar.owner_db_user_id || !defaultCalendar.owner_db_user_id.equals(user._id))) {
      await calendars.updateOne(
        { id: defaultCalendar.id },
        {
          $set: {
            owner_db_user_id: user._id,
            updated_at: new Date().toISOString(),
          },
        }
      );
      defaultCalendar.owner_db_user_id = user._id;
    }

    if (!defaultCalendar) {
      skippedPairs += 1;
      continue;
    }

    const calendarUpdate = await appointments.updateMany(
      {
        tenant_id: tenantId,
        user_id: userId,
        $or: [
          { calendar_id: { $exists: false } },
          { calendar_id: null },
        ],
      },
      {
        $set: {
          calendar_id: defaultCalendar.id,
        },
      }
    );
    assignedAppointments += calendarUpdate.modifiedCount;

    if (defaultCalendar.owner_db_user_id) {
      const creatorUpdate = await appointments.updateMany(
        {
          tenant_id: tenantId,
          user_id: userId,
          $or: [
            { created_by_user_id: { $exists: false } },
            { created_by_user_id: null },
          ],
        },
        {
          $set: {
            created_by_user_id: defaultCalendar.owner_db_user_id,
          },
        }
      );
      backfilledCreators += creatorUpdate.modifiedCount;
    }
  }

  console.log(
    `Calendar migration backfill completed. Created calendars: ${createdCalendars}, assigned appointments: ${assignedAppointments}, backfilled creators: ${backfilledCreators}, skipped pairs: ${skippedPairs}.`
  );
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required to run MongoDB migrations.');
  }

  const client = new MongoClient(uri);
  const dbName = getDbName(uri);
  await client.connect();
  const db = client.db(dbName);

  try {
    await ensureCollections(db);
    await ensureIndexes(db);
    await backfillDefaultCalendars(db);
    console.log('Calendar collections and indexes created successfully.');
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Calendar migration failed:', error);
  process.exit(1);
});
