/**
 * Safe calendar rollout:
 * 1. Clone the current MongoDB database into a timestamped backup DB
 * 2. Run the calendar migration on the active DB
 * 3. Save a manifest so the backup can be dropped later if approved
 *
 * Usage:
 *   node scripts/migrations/backup-and-run-calendar-rollout.js
 *   node scripts/migrations/backup-and-run-calendar-rollout.js --apply
 *   node scripts/migrations/backup-and-run-calendar-rollout.js --apply --backup-db m-saas_calbak_20260407_221800
 *   node scripts/migrations/backup-and-run-calendar-rollout.js --apply --skip-backup --backup-db m-saas_calbak_20260407_221800
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { MongoClient } = require('mongodb');

const APPLY = process.argv.includes('--apply');
const SKIP_BACKUP = process.argv.includes('--skip-backup');

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || null;
}

function getDbName(uri) {
  if (process.env.MONGODB_DB) return process.env.MONGODB_DB;
  try {
    const url = new URL(uri);
    const dbName = url.pathname ? url.pathname.replace(/^\//, '') : '';
    if (dbName) return dbName;
  } catch {
    // ignore
  }
  return 'm-saas';
}

function createTimestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ];

  return `${parts[0]}${parts[1]}${parts[2]}_${parts[3]}${parts[4]}${parts[5]}`;
}

function sanitizeIndexOptions(index) {
  const { key, v, ns, ...options } = index;
  return { key, options };
}

async function ensureBackupDoesNotExist(client, backupDbName) {
  const backupDb = client.db(backupDbName);
  const collections = await backupDb.listCollections({}, { nameOnly: true }).toArray();
  if (collections.length > 0) {
    throw new Error(`Backup DB "${backupDbName}" already exists and is not empty.`);
  }
}

async function ensureBackupExists(client, backupDbName) {
  const backupDb = client.db(backupDbName);
  const collections = await backupDb.listCollections({}, { nameOnly: true }).toArray();
  if (collections.length === 0) {
    throw new Error(`Backup DB "${backupDbName}" does not exist or is empty, so rollout cannot resume from it.`);
  }
}

async function copyCollection(sourceDb, targetDb, collectionName) {
  const sourceCollection = sourceDb.collection(collectionName);
  const targetCollection = targetDb.collection(collectionName);
  const collectionInfo = await sourceDb.listCollections({ name: collectionName }).next();

  if (collectionInfo?.options && Object.keys(collectionInfo.options).length > 0) {
    await targetDb.createCollection(collectionName, collectionInfo.options).catch(async () => {
      const exists = await targetDb.listCollections({ name: collectionName }).hasNext();
      if (!exists) {
        throw new Error(`Failed to create backup collection "${collectionName}".`);
      }
    });
  }

  const cursor = sourceCollection.find({});
  const batch = [];
  let copiedCount = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) {
      continue;
    }

    batch.push(doc);
    if (batch.length >= 500) {
      await targetCollection.insertMany(batch, { ordered: false });
      copiedCount += batch.length;
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    await targetCollection.insertMany(batch, { ordered: false });
    copiedCount += batch.length;
  }

  const indexes = await sourceCollection.indexes();
  for (const index of indexes) {
    if (index.name === '_id_') {
      continue;
    }

    const { key, options } = sanitizeIndexOptions(index);
    await targetCollection.createIndex(key, options);
  }

  return copiedCount;
}

async function cloneDatabase(client, sourceDbName, backupDbName) {
  const sourceDb = client.db(sourceDbName);
  const targetDb = client.db(backupDbName);
  const collections = await sourceDb.listCollections({}, { nameOnly: true }).toArray();
  const names = collections
    .map((collection) => collection.name)
    .filter((name) => typeof name === 'string' && !name.startsWith('system.'));

  const summary = [];
  for (const name of names) {
    const copiedCount = await copyCollection(sourceDb, targetDb, name);
    summary.push({ collection: name, copiedCount });
    console.log(`Backed up ${name}: ${copiedCount} documents`);
  }

  return summary;
}

async function runCalendarMigration(sourceDbName) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['migrations/003_add_calendars.js'],
      {
        cwd: process.cwd(),
        stdio: 'inherit',
        env: {
          ...process.env,
          MONGODB_DB: sourceDbName,
        },
      }
    );

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Calendar migration exited with code ${code}`));
    });
  });
}

async function writeManifest(manifestPath, payload) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(payload, null, 2));
}

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required');
  }

  const sourceDbName = getDbName(mongoUri);
  const backupDbName =
    getArgValue('--backup-db') || `${sourceDbName}_calbak_${createTimestamp()}`;
  const manifestPath = path.join(process.cwd(), 'reports', 'calendar-rollout-backups', `${backupDbName}.json`);

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Source DB: ${sourceDbName}`);
  console.log(`Backup DB: ${backupDbName}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Skip backup: ${SKIP_BACKUP ? 'yes' : 'no'}`);

  if (!APPLY) {
    console.log('Dry-run complete. Re-run with --apply to clone the DB and execute the calendar rollout.');
    return;
  }

  const client = new MongoClient(mongoUri);
  const startedAt = new Date().toISOString();
  try {
    await client.connect();
    let manifest;

    if (SKIP_BACKUP) {
      await ensureBackupExists(client, backupDbName);
      manifest = fs.existsSync(manifestPath)
        ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        : {
            kind: 'calendar-rollout-backup',
            createdAt: startedAt,
            sourceDbName,
            backupDbName,
            status: 'backup-complete',
            collections: [],
          };
    } else {
      await ensureBackupDoesNotExist(client, backupDbName);

      const collections = await cloneDatabase(client, sourceDbName, backupDbName);
      manifest = {
        kind: 'calendar-rollout-backup',
        createdAt: startedAt,
        sourceDbName,
        backupDbName,
        status: 'backup-complete',
        collections,
      };
      await writeManifest(manifestPath, manifest);
    }

    await runCalendarMigration(sourceDbName);

    const { error: _error, failedAt: _failedAt, ...cleanManifest } = manifest;
    await writeManifest(manifestPath, {
      ...cleanManifest,
      status: 'rollout-complete',
      migration: 'migrations/003_add_calendars.js',
      rolloutCompletedAt: new Date().toISOString(),
    });

    console.log('Calendar rollout completed successfully.');
    console.log(`Backup preserved in DB: ${backupDbName}`);
  } catch (error) {
    await writeManifest(manifestPath, {
      kind: 'calendar-rollout-backup',
      createdAt: startedAt,
      sourceDbName,
      backupDbName,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      failedAt: new Date().toISOString(),
    });
    throw error;
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Failed to backup DB and run calendar rollout:', error);
  process.exit(1);
});
