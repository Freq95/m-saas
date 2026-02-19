import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { sendEmail } from '@/lib/email';

export interface InviteToken {
  _id: ObjectId;
  token: string;
  email: string;
  user_id: ObjectId;
  tenant_id: ObjectId;
  role: string;
  expires_at: Date;
  used_at: Date | null;
  created_by: ObjectId;
  created_at: Date;
}

let inviteIndexesEnsured = false;

async function ensureInviteIndexes(db: any) {
  if (inviteIndexesEnsured) return;
  await Promise.all([
    db.collection('invite_tokens').createIndex({ token: 1 }, { unique: true }),
    db.collection('invite_tokens').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    db.collection('invite_tokens').createIndex({ email: 1, used_at: 1 }),
  ]);
  inviteIndexesEnsured = true;
}

function getBaseUrl() {
  const vercel = process.env.VERCEL_URL;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (vercel) return vercel.startsWith('http') ? vercel : `https://${vercel}`;
  return 'http://localhost:3000';
}

export async function createInviteToken(
  email: string,
  userId: ObjectId,
  tenantId: ObjectId,
  role: string,
  createdBy: ObjectId
): Promise<string> {
  const db = await getMongoDbOrThrow();
  await ensureInviteIndexes(db);
  const token = crypto.randomBytes(32).toString('hex');

  await db.collection('invite_tokens').insertOne({
    token,
    email: email.toLowerCase().trim(),
    user_id: userId,
    tenant_id: tenantId,
    role,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
    used_at: null,
    created_by: createdBy,
    created_at: new Date(),
  });

  return token;
}

export async function validateInviteToken(token: string): Promise<InviteToken | null> {
  const db = await getMongoDbOrThrow();
  const invite = await db.collection('invite_tokens').findOne({
    token,
    used_at: null,
    expires_at: { $gt: new Date() },
  });
  return invite as InviteToken | null;
}

export async function markInviteUsed(token: string): Promise<void> {
  const db = await getMongoDbOrThrow();
  await db.collection('invite_tokens').updateOne({ token }, { $set: { used_at: new Date() } });
}

export async function sendInviteEmail(email: string, name: string, tenantName: string, token: string) {
  const inviteUrl = `${getBaseUrl()}/invite/${token}`;

  await sendEmail({
    to: email,
    subject: `Ai fost invitat pe ${tenantName}`,
    html: `
      <h2>Bine ai venit!</h2>
      <p>Salut ${name},</p>
      <p>Ai fost invitat sa te alaturi platformei <strong>${tenantName}</strong>.</p>
      <p>Apasa pe butonul de mai jos pentru a-ti seta parola:</p>
      <p>
        <a href="${inviteUrl}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">
          Seteaza parola
        </a>
      </p>
      <p>Link-ul expira in 48 de ore.</p>
      <p style="color:#666;font-size:13px;">Daca nu ai solicitat aceasta invitatie, ignora acest email.</p>
    `,
  });
}
