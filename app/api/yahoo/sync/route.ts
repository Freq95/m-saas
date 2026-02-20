import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

import { getYahooConfig } from '@/lib/yahoo-mail';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getAuthUser, type AuthContext } from '@/lib/auth-helpers';
import { syncYahooInboxForUser } from '@/lib/yahoo-sync-runner';

// POST /api/yahoo/sync - Sync Yahoo Mail inbox
export async function POST(request: NextRequest) {
  try {
    const authUser: AuthContext = await getAuthUser();
    const { userId, tenantId } = authUser;
    const body = await request.json();

    // Validate input
    const { yahooSyncSchema } = await import('@/lib/validation');
    const validationResult = yahooSyncSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const { todayOnly, since, enableAiTagging, markAsRead } = validationResult.data;

    const result = await syncYahooInboxForUser(userId, tenantId, {
      todayOnly,
      since,
      enableAiTagging,
      markAsRead,
    });

    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error, 'Failed to sync Yahoo Mail');
  }
}

// GET /api/yahoo/sync - Test Yahoo connection
export async function GET(_request: NextRequest) {
  try {
    const authUser: AuthContext = await getAuthUser();
    const { userId, tenantId } = authUser;

    const config = await getYahooConfig(userId, tenantId);

    if (!config) {
      return createSuccessResponse({
        connected: false,
        error: 'Yahoo Mail not configured',
      });
    }

    const { testYahooConnection } = await import('@/lib/yahoo-mail');
    const connected = await testYahooConnection(config);

    return createSuccessResponse({
      connected,
      email: config.email,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to test Yahoo connection');
  }
}
