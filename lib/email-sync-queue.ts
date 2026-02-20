import { Client } from '@upstash/qstash';

export function getAppBaseUrl(): string {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_BASE_URL;
  if (!baseUrl) {
    throw new Error('NEXTAUTH_URL or APP_BASE_URL is required for background job callbacks.');
  }
  return baseUrl.replace(/\/+$/, '');
}

export async function enqueueYahooSyncJob(
  integrationId: number,
  tenantId?: string
): Promise<{ queued: boolean; messageId?: string }> {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    return { queued: false };
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    throw new Error('CRON_SECRET is required when QSTASH_TOKEN is configured.');
  }

  const client = new Client({ token });
  const baseUrl = getAppBaseUrl();
  const result = await client.publishJSON({
    url: `${baseUrl}/api/jobs/email-sync/yahoo`,
    body: { integrationId, tenantId: tenantId || undefined },
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'Content-Type': 'application/json',
    },
  });

  return { queued: true, messageId: result.messageId };
}
