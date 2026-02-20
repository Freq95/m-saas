import { NextRequest } from 'next/server';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';
import { hasValidCronSecret } from '@/lib/cron-auth';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { enqueueYahooSyncJob } from '@/lib/email-sync-queue';
import { syncYahooInboxForIntegration } from '@/lib/yahoo-sync-runner';
import { ObjectId } from 'mongodb';
import { logger } from '@/lib/logger';

const DEFAULT_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 20;
const BUCHAREST_TIMEZONE = 'Europe/Bucharest';
const QUIET_HOUR_START = 22;
const QUIET_HOUR_END = 6;

function getHourInBucharest(now: Date): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUCHAREST_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).format(now);
  return Number.parseInt(formatted, 10);
}

function isQuietHours(now: Date): boolean {
  const hour = getHourInBucharest(now);
  return hour >= QUIET_HOUR_START || hour < QUIET_HOUR_END;
}

// POST /api/cron/email-sync
// Fan-out endpoint: enqueue one Yahoo sync worker per active integration.
export async function POST(request: NextRequest) {
  try {
    if (!hasValidCronSecret(request)) {
      return createErrorResponse('Unauthorized', 401);
    }

    const now = new Date();
    if (isQuietHours(now)) {
      return createSuccessResponse({
        skipped: true,
        reason: 'quiet-hours',
        timezone: BUCHAREST_TIMEZONE,
        range: '22:00-05:59',
      });
    }

    const body = await request.json().catch(() => ({}));
    const requestedBatch = Number(body?.batchSize ?? DEFAULT_BATCH_SIZE);
    const batchSize = Number.isFinite(requestedBatch)
      ? Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(requestedBatch)))
      : DEFAULT_BATCH_SIZE;

    const db = await getMongoDbOrThrow();
    const activeYahooIntegrations = await db
      .collection('email_integrations')
      .find({ provider: 'yahoo', is_active: true })
      .sort({ last_sync_at: 1 })
      .limit(batchSize)
      .project({ id: 1, tenant_id: 1 })
      .toArray();

    const integrationTargets = activeYahooIntegrations
      .map((doc: any) => ({
        integrationId: Number(doc.id),
        tenantId: doc.tenant_id ? String(doc.tenant_id) : null,
      }))
      .filter((target: { integrationId: number }) => Number.isInteger(target.integrationId) && target.integrationId > 0);

    if (integrationTargets.length === 0) {
      return createSuccessResponse({
        queued: 0,
        processedInline: 0,
        totalCandidates: 0,
        mode: process.env.QSTASH_TOKEN ? 'qstash' : 'inline',
      });
    }

    let queued = 0;
    let processedInline = 0;
    let failed = 0;

    for (const target of integrationTargets) {
      const { integrationId, tenantId } = target;
      try {
        const queuedResult = await enqueueYahooSyncJob(integrationId, tenantId || undefined);
        if (queuedResult.queued) {
          queued++;
        } else {
          await syncYahooInboxForIntegration(
            integrationId,
            {
              enableAiTagging: false,
              markAsRead: false,
            },
            tenantId ? new ObjectId(tenantId) : undefined
          );
          processedInline++;
        }
      } catch (error) {
        logger.error(
          'Cron: email-sync job failed',
          error instanceof Error ? error : new Error(String(error)),
          { integrationId, tenantId }
        );
        failed++;
      }
    }

    return createSuccessResponse({
      queued,
      processedInline,
      failed,
      totalCandidates: integrationTargets.length,
      mode: process.env.QSTASH_TOKEN ? 'qstash' : 'inline',
    });
  } catch (error) {
    return handleApiError(error, 'Failed to dispatch email sync jobs');
  }
}
