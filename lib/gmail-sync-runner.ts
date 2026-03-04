import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow, getNextNumericId } from '@/lib/db/mongo-utils';
import { decrypt } from '@/lib/encryption';
import { fetchGmailMessages, getValidAccessToken } from '@/lib/gmail';
import { logger } from '@/lib/logger';

export type GmailSyncOptions = {
  enableAiTagging?: boolean;
  markAsRead?: boolean;
};

export type GmailSyncRunResult = {
  success: true;
  synced: number;
  skipped: number;
  errors: number;
  total: number;
  integrationId?: number;
};

type GmailIntegrationDoc = {
  id: number;
  user_id: number;
  tenant_id: ObjectId;
  email: string;
  encrypted_access_token?: string | null;
  encrypted_refresh_token?: string | null;
  token_expires_at?: number | null;
  last_sync_at?: string | null;
  is_active: boolean;
};

function extractAddress(raw: string): { email: string; name: string } {
  const match = raw.match(/<([^>]+)>/);
  const email = (match?.[1] || raw || '').trim();
  const name = raw.replace(/<[^>]+>/g, '').trim() || email.split('@')[0] || 'Unknown';
  return { email, name };
}

export async function syncGmailInboxForUser(
  userId: number,
  tenantId: ObjectId
): Promise<GmailSyncRunResult> {
  const db = await getMongoDbOrThrow();
  const integration = (await db.collection('email_integrations').findOne({
    user_id: userId,
    tenant_id: tenantId,
    provider: 'gmail',
    is_active: true,
  })) as GmailIntegrationDoc | null;

  if (!integration) {
    throw new Error('No active Gmail integration found');
  }

  return syncGmailInboxForIntegration(integration.id, {}, tenantId);
}

export async function syncGmailInboxForIntegration(
  integrationId: number,
  _options: GmailSyncOptions = {},
  tenantId?: ObjectId
): Promise<GmailSyncRunResult> {
  const db = await getMongoDbOrThrow();
  const filter: Record<string, unknown> = { id: integrationId, provider: 'gmail', is_active: true };
  if (tenantId) filter.tenant_id = tenantId;

  const integration = (await db.collection('email_integrations').findOne(filter)) as GmailIntegrationDoc | null;
  if (!integration) {
    throw new Error(`Gmail integration ${integrationId} not found or inactive.`);
  }

  const decryptedAccessToken = integration.encrypted_access_token ? decrypt(integration.encrypted_access_token) : null;
  const decryptedRefreshToken = integration.encrypted_refresh_token
    ? decrypt(integration.encrypted_refresh_token)
    : null;

  const accessToken = await getValidAccessToken(
    integration.id,
    decryptedAccessToken,
    decryptedRefreshToken,
    integration.token_expires_at ?? null
  );

  const gmailMessages = await fetchGmailMessages(accessToken, integration.last_sync_at ?? null);

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const message of gmailMessages) {
    try {
      const from = extractAddress(message.from);
      if (!from.email) {
        skipped++;
        continue;
      }

      let conversation = await db.collection('conversations').findOne({
        user_id: integration.user_id,
        tenant_id: integration.tenant_id,
        channel: 'email',
        contact_email: from.email,
      });

      if (!conversation) {
        const conversationId = await getNextNumericId('conversations');
        const now = new Date().toISOString();
        const conversationDoc = {
          _id: conversationId,
          id: conversationId,
          user_id: integration.user_id,
          tenant_id: integration.tenant_id,
          channel: 'email',
          channel_id: message.messageId,
          contact_name: from.name,
          contact_email: from.email,
          subject: message.subject || null,
          client_id: null,
          created_at: now,
          updated_at: now,
        };
        await db.collection('conversations').insertOne(conversationDoc);
        conversation = conversationDoc;
      }

      const existingMessage = await db.collection('messages').findOne({
        conversation_id: conversation.id,
        tenant_id: integration.tenant_id,
        external_id: message.messageId,
      });

      if (existingMessage) {
        skipped++;
        continue;
      }

      const { serializeMessage } = await import('@/lib/email-types');
      const messageId = await getNextNumericId('messages');
      const nowIso = new Date().toISOString();
      await db.collection('messages').insertOne({
        _id: messageId,
        id: messageId,
        tenant_id: integration.tenant_id,
        conversation_id: conversation.id,
        direction: 'inbound',
        content: serializeMessage({
          text: message.text || '',
          html: message.html || undefined,
          messageId: message.messageId,
        }),
        is_read: false,
        sent_at: nowIso,
        created_at: nowIso,
        external_id: message.messageId,
        source_uid: null,
      });

      await db.collection('conversations').updateOne(
        { id: conversation.id, tenant_id: integration.tenant_id },
        { $set: { updated_at: nowIso } }
      );

      synced++;
    } catch (error) {
      errors++;
      logger.error('Gmail sync: failed to process message', error instanceof Error ? error : new Error(String(error)), {
        integrationId,
        messageId: message.messageId,
      });
    }
  }

  await db.collection('email_integrations').updateOne(
    { id: integration.id, tenant_id: integration.tenant_id },
    { $set: { last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() } }
  );

  return {
    success: true,
    synced,
    skipped,
    errors,
    total: gmailMessages.length,
    integrationId: integration.id,
  };
}
