import 'dotenv/config';
import * as fs from 'fs';
import { MongoClient } from 'mongodb';
import { buildClientStorageKey, getStorageProvider, isStorageConfigured } from '../lib/storage';

type CollectionPlan = {
  name: string;
  clientIdField: 'client_id' | 'contact_id';
};

const COLLECTIONS: CollectionPlan[] = [
  { name: 'client_files', clientIdField: 'client_id' },
  { name: 'contact_files', clientIdField: 'contact_id' },
];

function toSafeTenantId(value: unknown): string {
  if (!value) return 'unknown';
  return String(value);
}

async function main() {
  if (!isStorageConfigured()) {
    throw new Error(
      'Cloud storage is not configured. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT_URL, R2_BUCKET_NAME.'
    );
  }
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is required');
  }

  const dbName = process.env.MONGODB_DB || 'm-saas';
  const client = new MongoClient(mongoUri);
  const storage = getStorageProvider();
  await client.connect();
  const db = client.db(dbName);

  let migrated = 0;
  let skippedMissingPath = 0;
  let skippedNoFile = 0;
  let failed = 0;

  try {
    for (const collectionPlan of COLLECTIONS) {
      const collection = db.collection(collectionPlan.name);
      const cursor = collection.find({
        $or: [{ storage_key: { $exists: false } }, { storage_key: null }],
        file_path: { $exists: true, $ne: null },
      });

      for await (const doc of cursor) {
        const filePath = String(doc.file_path || '');
        if (!filePath) {
          skippedMissingPath++;
          continue;
        }
        if (!fs.existsSync(filePath)) {
          skippedNoFile++;
          continue;
        }

        try {
          const tenantId = toSafeTenantId(doc.tenant_id);
          const clientIdRaw = doc[collectionPlan.clientIdField];
          const clientId = typeof clientIdRaw === 'number' && clientIdRaw > 0 ? clientIdRaw : 0;
          const originalFilename = String(doc.original_filename || doc.filename || 'file.bin');
          const key = buildClientStorageKey(tenantId, clientId, originalFilename);
          const fileBuffer = fs.readFileSync(filePath);
          const mimeType = String(doc.mime_type || 'application/octet-stream');

          await storage.upload(key, fileBuffer, mimeType);

          await collection.updateOne(
            { _id: doc._id },
            {
              $set: {
                storage_key: key,
                updated_at: new Date().toISOString(),
              },
            }
          );
          migrated++;
        } catch (error) {
          failed++;
          // eslint-disable-next-line no-console
          console.error(
            `Failed migrating ${collectionPlan.name}#${String(doc.id || doc._id)}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    }
  } finally {
    await client.close();
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        migrated,
        skippedMissingPath,
        skippedNoFile,
        failed,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
