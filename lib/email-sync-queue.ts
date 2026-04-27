// QStash (Upstash) is not configured. Sync jobs return { queued: false } immediately.
// Callers already handle this gracefully with an inline synchronous fallback.
// To enable: set QSTASH_TOKEN and APP_BASE_URL in environment variables,
// then restore the Client import and enqueue logic below.

// import { Client } from '@upstash/qstash';

export async function enqueueYahooSyncJob(
  _integrationId: number,
  _tenantId?: string
): Promise<{ queued: boolean; messageId?: string }> {
  return { queued: false };
}

export async function enqueueGmailSyncJob(
  _integrationId: number,
  _tenantId?: string
): Promise<{ queued: boolean; messageId?: string }> {
  return { queued: false };
}
