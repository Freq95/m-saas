import { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { getYahooConfig, sendYahooEmail } from '@/lib/yahoo-mail';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser, type AuthContext } from '@/lib/auth-helpers';
import { getRedis } from '@/lib/redis';
import { withRedisPrefix } from '@/lib/redis-prefix';

const EMAIL_SEND_LIMIT = 20;
const EMAIL_SEND_WINDOW_SECONDS = 60 * 60;
const emailSendFallbackStore = new Map<number, { count: number; resetAt: number }>();

let emailSendLimiter: Ratelimit | null = null;

function getEmailSendLimiter(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  if (!emailSendLimiter) {
    emailSendLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(EMAIL_SEND_LIMIT, '1 h'),
      prefix: withRedisPrefix('rl:email:send'),
      analytics: false,
    });
  }
  return emailSendLimiter;
}

async function isEmailSendRateLimited(userId: number): Promise<boolean> {
  const limiter = getEmailSendLimiter();
  if (limiter) {
    const result = await limiter.limit(String(userId));
    return !result.success;
  }

  const now = Date.now();
  const existing = emailSendFallbackStore.get(userId);
  if (!existing || now > existing.resetAt) {
    emailSendFallbackStore.set(userId, { count: 1, resetAt: now + EMAIL_SEND_WINDOW_SECONDS * 1000 });
    return false;
  }
  if (existing.count >= EMAIL_SEND_LIMIT) {
    return true;
  }
  existing.count += 1;
  return false;
}

// POST /api/yahoo/send - Send email via Yahoo
export async function POST(request: NextRequest) {
  try {
    const authUser: AuthContext = await getAuthUser();
    const { userId, tenantId } = authUser;
    if (await isEmailSendRateLimited(userId)) {
      return createErrorResponse('Rate limit exceeded', 429);
    }
    const body = await request.json();

    const config = await getYahooConfig(userId, tenantId);

    if (!config) {
      return createErrorResponse(
        'No email account connected. Go to Settings -> Email to connect your Yahoo account.',
        400
      );
    }

    // Validate input
    const { yahooSendSchema } = await import('@/lib/validation');
    const validationResult = yahooSendSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const { to, subject, text, html } = validationResult.data;

    // Send email via Yahoo SMTP
    await sendYahooEmail(config, to, subject, text, html);

    return createSuccessResponse({
      success: true,
      message: 'Email sent successfully',
    });
  } catch (error) {
    return handleApiError(error, 'Failed to send email');
  }
}

