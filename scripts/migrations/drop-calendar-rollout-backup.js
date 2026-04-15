/**
 * Drop a preserved backup DB created by backup-and-run-calendar-rollout.js
 *
 * Usage:
 *   node scripts/migrations/drop-calendar-rollout-backup.js --db <backupDbName>
 *   node scripts/migrations/drop-calendar-rollout-backup.js --db <backupDbName> --apply
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const APPLY = process.argv.includes('--apply');

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

async function run() {
  const mongoUri = process.env.MONGODB_URI;
  const backupDbName = getArgValue('--db');

  if (!mongoUri) {
    throw new Error('MONGODB_URI is required');
  }
  if (!backupDbName) {
    throw new Error('Usage: node scripts/migrations/drop-calendar-rollout-backup.js --db <backupDbName> [--apply]');
  }

  const sourceDbName = getDbName(mongoUri);
  if (backupDbName === sourceDbName) {
    throw new Error('Refusing to drop the active source DB.');
  }
  if (!backupDbName.includes('_calbak_')) {
    throw new Error('Refusing to drop a DB that does not look like a calendar rollout backup.');
  }

  const manifestPath = path.join(process.cwd(), 'reports', 'calendar-rollout-backups', `${backupDbName}.json`);

  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Backup DB: ${backupDbName}`);
  console.log(`Manifest: ${manifestPath}`);

  if (!APPLY) {
    console.log('Dry-run complete. Re-run with --apply to drop the preserved backup DB.');
    return;
  }

  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(backupDbName);
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();

    if (collections.length === 0) {
      console.log('Backup DB is already empty or missing.');
    } else {
      await db.dropDatabase();
      console.log(`Dropped backup DB: ${backupDbName}`);
    }

    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      fs.writeFileSync(
        manifestPath,
        JSON.stringify(
          {
            ...manifest,
            status: 'dropped',
            droppedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );
    }
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Failed to drop calendar rollout backup DB:', error);
  process.exit(1);
});
