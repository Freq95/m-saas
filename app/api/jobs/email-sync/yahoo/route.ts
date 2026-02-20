import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { syncYahooInboxForIntegration } from '@/lib/yahoo-sync-runner';
import { ObjectId } from 'mongodb';

const JOB_TIMEOUT_MS = 55_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Job timed out')), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// POST /api/jobs/email-sync/yahoo
// Internal worker endpoint for one integration sync job.
export async function POST(request: NextRequest) {
  try {
    if (!hasValidCronSecret(request)) {
      return createErrorResponse('Unauthorized', 401);
    }

    const body = await request.json().catch(() => ({}));
    const integrationId = Number(body.integrationId);
    const tenantId = typeof body.tenantId === 'string' && ObjectId.isValid(body.tenantId)
      ? new ObjectId(body.tenantId)
      : undefined;
    if (!Number.isInteger(integrationId) || integrationId <= 0) {
      return createErrorResponse('integrationId is required', 400);
    }

    const result = await withTimeout(
      syncYahooInboxForIntegration(
        integrationId,
        {
          enableAiTagging: false,
          markAsRead: false,
        },
        tenantId
      ),
      JOB_TIMEOUT_MS
    );

    return createSuccessResponse(result);
  } catch (error) {
    return handleApiError(error, 'Yahoo background sync job failed');
  }
}
