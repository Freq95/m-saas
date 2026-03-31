import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { sendEmail } from '@/lib/email';
import { createErrorResponse } from '@/lib/error-handler';
import { getRedis } from '@/lib/redis';
import { withRedisPrefix } from '@/lib/redis-prefix';

const FORGOT_PASSWORD_LIMIT = 3;
const FORGOT_PASSWORD_WINDOW_MS = 60 * 60 * 1000;
const forgotPasswordFallbackStore = new Map<string, { count: number; resetAt: number }>();
let forgotPasswordLimiter: Ratelimit | null = null;
let passwordResetIndexesEnsured = false;

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getForgotPasswordLimiter(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  if (!forgotPasswordLimiter) {
    forgotPasswordLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(FORGOT_PASSWORD_LIMIT, '1 h'),
      prefix: withRedisPrefix('rl:auth:forgot-password'),
      analytics: false,
    });
  }
  return forgotPasswordLimiter;
}

async function isForgotPasswordRateLimited(identifier: string): Promise<boolean> {
  const limiter = getForgotPasswordLimiter();
  if (limiter) {
    const result = await limiter.limit(identifier);
    return !result.success;
  }

  const now = Date.now();
  const existing = forgotPasswordFallbackStore.get(identifier);
  if (!existing || now > existing.resetAt) {
    forgotPasswordFallbackStore.set(identifier, { count: 1, resetAt: now + FORGOT_PASSWORD_WINDOW_MS });
    return false;
  }
  if (existing.count >= FORGOT_PASSWORD_LIMIT) {
    return true;
  }
  existing.count += 1;
  return false;
}

async function ensurePasswordResetTokenIndexes(db: Awaited<ReturnType<typeof getMongoDbOrThrow>>) {
  if (passwordResetIndexesEnsured) return;
  await db.collection('password_reset_tokens').createIndexes([
    { key: { token_hash: 1 }, unique: true },
    { key: { expires_at: 1 }, expireAfterSeconds: 0 },
    { key: { email: 1, used_at: 1 } },
    { key: { user_id: 1, created_at: -1 } },
  ]);
  passwordResetIndexesEnsured = true;
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    if (await isForgotPasswordRateLimited(ip)) {
      return createErrorResponse('Rate limit exceeded', 429);
    }

    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email) {
      return NextResponse.json({ success: true });
    }

    const db = await getMongoDbOrThrow();
    await ensurePasswordResetTokenIndexes(db);
    const user = await db.collection('users').findOne({ email, status: 'active' });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const now = new Date();
      const resetLinkBase = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
      const resetLink = `${resetLinkBase}/reset-password?token=${encodeURIComponent(token)}`;

      const insertResult = await db.collection('password_reset_tokens').insertOne({
        user_id: user._id,
        email,
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null,
        created_at: now,
        updated_at: now,
      });

      try {
        const sendResult = await sendEmail({
          to: email,
          subject: 'Resetare parola',
          html: `
            <p>Ai cerut resetarea parolei.</p>
            <p><a href="${resetLink}">Apasa aici pentru a seta o parola noua</a></p>
            <p>Linkul expira in 1 ora.</p>
          `,
        });

        if (sendResult.ok) {
          await db.collection('password_reset_tokens').deleteMany({
            user_id: user._id,
            _id: { $ne: insertResult.insertedId },
          });
        } else {
          await db.collection('password_reset_tokens').deleteOne({
            _id: insertResult.insertedId,
          });
        }
      } catch {
        await db.collection('password_reset_tokens').deleteOne({
          _id: insertResult.insertedId,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
