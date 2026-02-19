import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getMongoDbOrThrow } from '../lib/db/mongo-utils';

async function createSuperAdmin() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || 'Platform Admin';

  if (!email || !password) {
    console.error('Usage: tsx scripts/create-super-admin.ts <email> <password> [name]');
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const db = await getMongoDbOrThrow();

  const existing = await db.collection('users').findOne({ email: normalizedEmail });
  if (existing) {
    console.error(`User ${normalizedEmail} already exists`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existingMaxId = await db
    .collection('users')
    .find({ id: { $type: 'number' } })
    .sort({ id: -1 })
    .limit(1)
    .next();
  const nextId = (existingMaxId?.id || 0) + 1;

  await db.collection('users').insertOne({
    id: nextId,
    email: normalizedEmail,
    password_hash: passwordHash,
    name,
    role: 'super_admin',
    tenant_id: null,
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log(`Super-admin created: ${normalizedEmail}`);
}

createSuperAdmin().catch((error) => {
  console.error(error);
  process.exit(1);
});
