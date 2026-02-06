import { NextRequest, NextResponse } from 'next/server';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getUserEmailIntegrations } from '@/lib/email-integrations';
import { DEFAULT_USER_ID } from '@/lib/constants';
import { logger } from '@/lib/logger';

// GET /api/settings/email-integrations
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = parseInt(searchParams.get('userId') || String(DEFAULT_USER_ID));
    
    const integrations = await getUserEmailIntegrations(userId);
    
    return createSuccessResponse({ integrations });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch email integrations');
  }
}

