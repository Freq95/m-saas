import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function unwrapFindOneAndUpdateResult<T>(result: any): T | null {
  if (!result) return null;
  if (typeof result === 'object' && 'value' in result) {
    return result.value as T | null;
  }
  return result as T;
}

async function findValidToken(token: string) {
  const db = await getMongoDbOrThrow();
  const tokenHash = hashToken(token);
  const now = new Date();
  const tokenDoc = await db.collection('password_reset_tokens').findOne({
    token_hash: tokenHash,
    expires_at: { $gt: now },
    used_at: null,
  });

  return { db, tokenDoc };
}

async function consumeValidToken(token: string) {
  const db = await getMongoDbOrThrow();
  const tokenHash = hashToken(token);
  const now = new Date();
  const tokenUpdateResult = await db.collection('password_reset_tokens').findOneAndUpdate(
    {
      token_hash: tokenHash,
      expires_at: { $gt: now },
      used_at: null,
    },
    {
      $set: {
        used_at: now,
        updated_at: now,
      },
    },
    { returnDocument: 'before' }
  );

  return { db, tokenDoc: unwrapFindOneAndUpdateResult<any>(tokenUpdateResult) };
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token') || '';
    if (!token) {
      return NextResponse.json({ valid: false });
    }

    const { tokenDoc } = await findValidToken(token);
    return NextResponse.json({ valid: Boolean(tokenDoc) });
  } catch {
    return NextResponse.json({ valid: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = typeof body?.token === 'string' ? body.token : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';

    if (!token || newPassword.length < 8) {
      return NextResponse.json({ error: 'Date invalide.' }, { status: 400 });
    }

    const { db, tokenDoc } = await consumeValidToken(token);
    if (!tokenDoc) {
      return NextResponse.json({ error: 'Token invalid sau expirat.' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const now = new Date().toISOString();

    const updateUserResult = await db.collection('users').updateOne(
      { _id: tokenDoc.user_id },
      {
        $set: {
          password_hash: passwordHash,
          updated_at: now,
        },
        $inc: {
          session_version: 1,
        },
        $unset: {
          reset_token: '',
          reset_token_expires: '',
        },
      }
    );
    if (updateUserResult.matchedCount === 0) {
      return NextResponse.json({ error: 'Token invalid sau expirat.' }, { status: 400 });
    }

    await db.collection('password_reset_tokens').deleteMany({
      user_id: tokenDoc.user_id,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Nu am putut reseta parola.' }, { status: 500 });
  }
}
