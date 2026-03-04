import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getAuthUser } from '@/lib/auth-helpers';
import { syncGmailInboxForUser } from '@/lib/gmail-sync-runner';

// POST /api/gmail/sync - Manually sync Gmail inbox for the current user
export async function POST(_request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();

    if (!tenantId) {
      return createSuccessResponse({ skipped: true, reason: 'no tenant' });
    }

    const result = await syncGmailInboxForUser(userId, tenantId);
    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error, 'Failed to sync Gmail inbox');
  }
}
