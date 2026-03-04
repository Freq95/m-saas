import { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getEmailIntegrationById } from '@/lib/email-integrations';
import { logger } from '@/lib/logger';
import { integrationIdParamSchema } from '@/lib/validation';
import { getAuthUser } from '@/lib/auth-helpers';
import { getRedis } from '@/lib/redis';
import { withRedisPrefix } from '@/lib/redis-prefix';
import { decrypt } from '@/lib/encryption';

const TEST_LIMIT = 5;
const TEST_WINDOW_MS = 10 * 60 * 1000;
const testFallbackStore = new Map<string, { count: number; resetAt: number }>();
let testLimiter: Ratelimit | null = null;

function getTestLimiter(): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  if (!testLimiter) {
    testLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(TEST_LIMIT, '10 m'),
      prefix: withRedisPrefix('rl:email:integration:test'),
      analytics: false,
    });
  }
  return testLimiter;
}

async function isTestRateLimited(identifier: string): Promise<boolean> {
  const limiter = getTestLimiter();
  if (limiter) {
    const result = await limiter.limit(identifier);
    return !result.success;
  }

  const now = Date.now();
  const existing = testFallbackStore.get(identifier);
  if (!existing || now > existing.resetAt) {
    testFallbackStore.set(identifier, { count: 1, resetAt: now + TEST_WINDOW_MS });
    return false;
  }
  if (existing.count >= TEST_LIMIT) {
    return true;
  }
  existing.count += 1;
  return false;
}

// POST /api/settings/email-integrations/[id]/test
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { userId, tenantId } = await getAuthUser();
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const rateLimitId = `${userId}:${ip}`;
    if (await isTestRateLimited(rateLimitId)) {
      return createErrorResponse('Rate limit exceeded', 429);
    }
    // Validate route parameter
    const paramValidation = integrationIdParamSchema.safeParse({ id: params.id });
    if (!paramValidation.success) {
      return createErrorResponse('Invalid integration ID', 400, JSON.stringify(paramValidation.error.errors));
    }
    
    const integrationId = paramValidation.data.id;
    // Get integration to check provider
    const integration = await getEmailIntegrationById(integrationId, userId, tenantId);
    
    if (!integration) {
      logger.warn('Integration not found for test', { integrationId, userId });
      return createErrorResponse('Integration not found', 404);
    }
    
    logger.info('Testing integration', { integrationId, provider: integration.provider, email: integration.email });
    
    // Test connection based on provider
    if (integration.provider === 'yahoo') {
      let password: string | null = null;
      if (integration.encrypted_password) {
        try {
          const { decrypt } = await import('@/lib/encryption');
          password = decrypt(integration.encrypted_password);
          logger.info('Password decrypted successfully');
        } catch (error) {
          logger.error('Failed to decrypt password', { error, integrationId });
          return createErrorResponse('Failed to decrypt password. Please check ENCRYPTION_KEY is set correctly.', 500);
        }
      }

      if (!password) {
        logger.warn('No password found for integration', { integrationId });
        return createErrorResponse('Integration not configured - no password found', 404);
      }

      const testConfig = {
        email: integration.email,
        password: password,
        appPassword: password,
      };
      
      try {
        const { testYahooConnection } = await import('@/lib/yahoo-mail');
        await testYahooConnection(testConfig);
        logger.info('Connection test successful', { integrationId });
        return createSuccessResponse({ success: true, message: 'Connection successful' });
      } catch (error) {
        logger.error('Connection test failed', { error, integrationId });
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return createErrorResponse(`Connection test failed: ${errorMessage}`, 400);
      }
    } else if (integration.provider === 'gmail') {
      const accessToken = integration.encrypted_access_token ? decrypt(integration.encrypted_access_token) : null;
      const refreshToken = integration.encrypted_refresh_token ? decrypt(integration.encrypted_refresh_token) : null;
      const tokenExpiresAt = typeof integration.token_expires_at === 'number' ? integration.token_expires_at : null;

      if (!accessToken && !refreshToken) {
        return createErrorResponse('Gmail not configured', 400);
      }

      const { getValidAccessToken, testGmailConnection } = await import('@/lib/gmail');
      const validAccessToken = await getValidAccessToken(integrationId, accessToken, refreshToken, tokenExpiresAt);
      const result = await testGmailConnection(validAccessToken);
      if (!result.ok) {
        return createErrorResponse(result.error || 'Connection test failed', 400);
      }
      return createSuccessResponse({ success: true, message: 'Connection successful' });
    } else {
      // Outlook testing would go here
      return createErrorResponse('Connection testing not yet implemented for this provider', 501);
    }
  } catch (error) {
    return handleApiError(error, 'Failed to test connection');
  }
}

