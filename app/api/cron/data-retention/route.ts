import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { retentionOptionsFromEnv, runDataRetention } from '@/lib/server/data-retention';

export const runtime = 'nodejs';
export const maxDuration = 300;

async function handleRetention(request: NextRequest) {
  try {
    if (process.env.GDPR_RETENTION_ENABLED !== 'true') {
      return createErrorResponse('Data retention processing is disabled', 503);
    }
    if (!hasValidCronSecret(request)) {
      return createErrorResponse('Unauthorized', 401);
    }

    const result = await runDataRetention(retentionOptionsFromEnv());
    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error, 'Failed to process data retention');
  }
}

export const GET = handleRetention;
export const POST = handleRetention;
