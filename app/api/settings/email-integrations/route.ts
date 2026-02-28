import { NextRequest } from 'next/server';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getUserEmailIntegrations } from '@/lib/email-integrations';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/settings/email-integrations
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    
    const integrations = await getUserEmailIntegrations(userId, tenantId);
    
    return createSuccessResponse({ integrations });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch email integrations');
  }
}

