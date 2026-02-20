import { ObjectId } from 'mongodb';
import { getMongoDbOrThrow, getNextNumericId } from '@/lib/db/mongo-utils';
import { fetchYahooEmails, getYahooConfig, markEmailAsRead } from '@/lib/yahoo-mail';
import { suggestTags } from '@/lib/ai-agent';
import { getStorageProvider } from '@/lib/storage';
import { decrypt } from '@/lib/encryption';
import { logger } from '@/lib/logger';

export type YahooSyncOptions = {
  todayOnly?: boolean;
  since?: string | Date;
  enableAiTagging?: boolean;
  markAsRead?: boolean;
};

export type YahooSyncRunResult = {
  success: true;
  synced: number;
  skipped: number;
  errors: number;
  tagged: number;
  aiTaggingEnabled: boolean;
  markAsReadEnabled: boolean;
  sinceUid: number | null;
  maxFetchedUid: number | null;
  total: number;
  integrationId?: number;
};

type IntegrationDoc = {
  id: number;
  user_id: number;
  tenant_id: ObjectId;
  provider: string;
  email: string;
  encrypted_password?: string | null;
  is_active: boolean;
  last_synced_uid?: number | null;
};

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildEmailAttachmentStorageKey(
  tenantId: string,
  conversationId: number,
  messageId: number,
  attachmentId: number,
  filename: string
): string {
  const safeName = sanitizeFilename(filename) || 'attachment.bin';
  return `tenants/${tenantId}/conversations/${conversationId}/messages/${messageId}/attachments/${attachmentId}_${Date.now()}_${safeName}`;
}

async function resolveYahooConfigForUser(
  userId: number,
  tenantId: ObjectId
): Promise<{ config: { email: string; password: string; appPassword?: string }; integrationDoc: IntegrationDoc | null }> {
  const config = await getYahooConfig(userId, tenantId);
  if (!config) {
    throw new Error('Yahoo Mail not configured for this user.');
  }

  const db = await getMongoDbOrThrow();
  const integrationDoc = await db
    .collection('email_integrations')
    .find({
      user_id: userId,
      tenant_id: tenantId,
      provider: 'yahoo',
      email: config.email,
      is_active: true,
    })
    .sort({ created_at: -1 })
    .limit(1)
    .next();

  return { config, integrationDoc: integrationDoc as IntegrationDoc | null };
}

async function resolveYahooConfigByIntegrationId(
  integrationId: number,
  tenantId?: ObjectId
): Promise<{
  config: { email: string; password: string; appPassword?: string };
  integrationDoc: IntegrationDoc;
}> {
  const db = await getMongoDbOrThrow();
  const integrationFilter: Record<string, unknown> = {
    id: integrationId,
    provider: 'yahoo',
    is_active: true,
  };
  if (tenantId) {
    integrationFilter.tenant_id = tenantId;
  }
  const integrationDoc = (await db.collection('email_integrations').findOne(
    integrationFilter
  )) as IntegrationDoc | null;

  if (!integrationDoc) {
    throw new Error(`Yahoo integration ${integrationId} not found or inactive.`);
  }
  if (!integrationDoc.encrypted_password) {
    throw new Error(`Yahoo integration ${integrationId} is missing credentials.`);
  }

  const password = decrypt(integrationDoc.encrypted_password);
  if (!password) {
    throw new Error(`Yahoo integration ${integrationId} credentials could not be decrypted.`);
  }

  return {
    config: { email: integrationDoc.email, password, appPassword: password },
    integrationDoc,
  };
}

async function runYahooSyncCore(
  userId: number,
  tenantId: ObjectId,
  config: { email: string; password: string; appPassword?: string },
  integrationDoc: IntegrationDoc | null,
  options: YahooSyncOptions,
  integrationId?: number
): Promise<YahooSyncRunResult> {
  const db = await getMongoDbOrThrow();
  const storage = getStorageProvider();
  const todayOnly = Boolean(options.todayOnly);
  const enableAiTagging = Boolean(options.enableAiTagging);
  const markAsRead = Boolean(options.markAsRead);

  let since: Date | undefined;
  if (todayOnly) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    since = today;
  } else if (options.since) {
    since = typeof options.since === 'string' ? new Date(options.since) : options.since;
  }

  const lastSyncedUid =
    integrationDoc && typeof integrationDoc.last_synced_uid === 'number'
      ? integrationDoc.last_synced_uid
      : undefined;

  logger.info('Yahoo sync: Fetching emails', {
    userId,
    integrationId: integrationId ?? null,
    since: since?.toISOString(),
    sinceUid: lastSyncedUid ?? null,
  });
  const emails = await fetchYahooEmails(config, since, lastSyncedUid);
  logger.info('Yahoo sync: Found emails', {
    userId,
    integrationId: integrationId ?? null,
    count: emails.length,
    sinceUid: lastSyncedUid ?? null,
  });

  let syncedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let taggedCount = 0;
  let maxFetchedUid = typeof lastSyncedUid === 'number' ? lastSyncedUid : 0;

  let tagsByName: Map<string, any> | null = null;
  if (enableAiTagging) {
    const allTags = await db.collection('tags').find({ tenant_id: tenantId }).toArray();
    tagsByName = new Map<string, any>();
    for (const tag of allTags) {
      if (typeof tag.name === 'string') {
        tagsByName.set(tag.name.toLowerCase(), tag);
      }
    }
  }

  for (const email of emails) {
    try {
      if (typeof email.uid === 'number' && email.uid > maxFetchedUid) {
        maxFetchedUid = email.uid;
      }

      const emailMatch = email.from.match(/<(.+)>/);
      const emailAddress = emailMatch ? emailMatch[1] : email.from;
      const name = email.from.replace(/<.+>/, '').trim() || emailAddress.split('@')[0];

      let client: { id: number } | null = null;
      const { linkConversationToClient } = await import('@/lib/client-matching');
      try {
        const escapedEmail = emailAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const existingClient = await db.collection('clients').findOne({
          user_id: userId,
          tenant_id: tenantId,
          email: { $regex: `^${escapedEmail}$`, $options: 'i' },
        });
        if (existingClient) {
          client = { id: existingClient.id };
        }
      } catch (clientError) {
        logger.warn('Yahoo sync: Failed to look up client', {
          userId,
          email: emailAddress,
          error: clientError instanceof Error ? clientError.message : String(clientError),
        });
      }

      const existingConv = await db
        .collection('conversations')
        .find({ user_id: userId, tenant_id: tenantId, channel: 'email', contact_email: emailAddress })
        .sort({ created_at: -1 })
        .limit(1)
        .next();

      let conversationId: number;
      let existingClientId: number | null = null;

      if (existingConv) {
        conversationId = existingConv.id;
        existingClientId = existingConv.client_id || null;
      } else {
        const now = new Date().toISOString();
        conversationId = await getNextNumericId('conversations');
        await db.collection('conversations').insertOne({
          _id: conversationId,
          id: conversationId,
          user_id: userId,
          tenant_id: tenantId,
          channel: 'email',
          channel_id: email.messageId || email.uid?.toString() || '',
          contact_name: name,
          contact_email: emailAddress,
          subject: email.subject || null,
          client_id: client?.id || null,
          created_at: now,
          updated_at: now,
        });
      }

      let existingMsg: { id: number } | null = null;
      if (email.messageId || email.uid) {
        existingMsg = await db.collection('messages').findOne({
          conversation_id: conversationId,
          tenant_id: tenantId,
          $or: [
            email.messageId ? { external_id: email.messageId } : undefined,
            email.uid ? { source_uid: email.uid } : undefined,
          ].filter(Boolean),
        });
      }

      if (!existingMsg) {
        const { serializeMessage } = await import('@/lib/email-types');
        const sentAt = email.date || new Date();
        const sentAtIso = sentAt.toISOString();
        const messageId = await getNextNumericId('messages');

        const persistedAttachments = [];
        for (const att of email.attachments || []) {
          const originalFilename = att.filename || 'attachment';
          if (!att.content || !(att.content instanceof Buffer)) {
            persistedAttachments.push({
              filename: originalFilename,
              contentType: att.contentType,
              size: att.size || 0,
              persisted: false,
            });
            continue;
          }

          try {
            const attachmentId = await getNextNumericId('message_attachments');
            const storageKey = buildEmailAttachmentStorageKey(
              String(tenantId),
              conversationId,
              messageId,
              attachmentId,
              originalFilename
            );
            await storage.upload(storageKey, att.content, att.contentType || 'application/octet-stream');

            await db.collection('message_attachments').insertOne({
              _id: attachmentId,
              id: attachmentId,
              user_id: userId,
              tenant_id: tenantId,
              conversation_id: conversationId,
              message_id: messageId,
              original_filename: originalFilename,
              filename: storageKey.split('/').pop() || sanitizeFilename(originalFilename),
              storage_key: storageKey,
              file_size: att.size || att.content.length,
              mime_type: att.contentType || 'application/octet-stream',
              source: 'yahoo',
              created_at: sentAtIso,
              updated_at: sentAtIso,
            });

            persistedAttachments.push({
              id: attachmentId,
              filename: originalFilename,
              contentType: att.contentType,
              size: att.size || att.content.length,
              persisted: true,
            });
          } catch (attachmentError) {
            logger.warn('Yahoo sync: Failed to persist attachment', {
              conversationId,
              filename: originalFilename,
              error: attachmentError instanceof Error ? attachmentError.message : String(attachmentError),
            });
            persistedAttachments.push({
              filename: originalFilename,
              contentType: att.contentType,
              size: att.size || 0,
              persisted: false,
            });
          }
        }

        const storedMessage = {
          text: email.cleanText || email.text || '',
          html: email.html,
          images: email.images?.map((img) => ({
            url: img.url,
            cid: img.cid,
            data: img.data,
            contentType: img.contentType,
          })),
          attachments: persistedAttachments,
          messageId: email.messageId,
          uid: email.uid,
        };

        await db.collection('messages').insertOne({
          _id: messageId,
          id: messageId,
          tenant_id: tenantId,
          conversation_id: conversationId,
          direction: 'inbound',
          content: serializeMessage(storedMessage),
          is_read: false,
          sent_at: sentAtIso,
          created_at: sentAtIso,
          external_id: email.messageId || null,
          source_uid: email.uid || null,
        });

        await db.collection('conversations').updateOne(
          { id: conversationId, tenant_id: tenantId },
          { $set: { updated_at: sentAtIso } }
        );

        if (client && !existingClientId) {
          try {
            await linkConversationToClient(conversationId, client.id, tenantId);
          } catch (linkError) {
            logger.warn('Yahoo sync: Failed to link conversation to client', {
              conversationId,
              error: linkError instanceof Error ? linkError.message : String(linkError),
            });
          }
        }

        if (enableAiTagging && tagsByName) {
          const suggestedTags = await suggestTags(email.text);
          if (suggestedTags.length > 0) {
            const newConvTags = suggestedTags
              .map((tagName) => tagsByName?.get(tagName.toLowerCase()))
              .filter(Boolean)
              .map((tag: any) => ({
                _id: `${conversationId}:${tag.id}`,
                conversation_id: conversationId,
                tenant_id: tenantId,
                tag_id: tag.id,
              }));

            if (newConvTags.length > 0) {
              await db.collection('conversation_tags').insertMany(newConvTags, { ordered: false });
              taggedCount += newConvTags.length;
            }
          }
        }

        if (markAsRead && email.uid) {
          try {
            await markEmailAsRead(config, email.uid);
          } catch (err) {
            logger.warn('Could not mark email as read', {
              uid: email.uid,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        syncedCount++;
      } else {
        skippedCount++;
      }
    } catch (err) {
      errorCount++;
      logger.error('Error processing email', err instanceof Error ? err : new Error(String(err)), {
        uid: email.uid,
        userId,
        integrationId: integrationId ?? null,
      });
    }
  }

  if (integrationDoc) {
    try {
      const now = new Date().toISOString();
      const setValues: Record<string, unknown> = {
        last_sync_at: now,
        updated_at: now,
      };
      if (maxFetchedUid > 0) {
        setValues.last_synced_uid = maxFetchedUid;
      }
      await db.collection('email_integrations').updateOne(
        { id: integrationDoc.id, tenant_id: integrationDoc.tenant_id },
        { $set: setValues }
      );
    } catch (err) {
      logger.warn('Failed to update integration sync cursor/time', { error: err });
    }
  }

  return {
    success: true,
    synced: syncedCount,
    skipped: skippedCount,
    errors: errorCount,
    tagged: taggedCount,
    aiTaggingEnabled: enableAiTagging,
    markAsReadEnabled: markAsRead,
    sinceUid: lastSyncedUid ?? null,
    maxFetchedUid: maxFetchedUid || null,
    total: emails.length,
    integrationId,
  };
}

export async function syncYahooInboxForUser(
  userId: number,
  tenantId: ObjectId,
  options: YahooSyncOptions = {}
): Promise<YahooSyncRunResult> {
  const { config, integrationDoc } = await resolveYahooConfigForUser(userId, tenantId);
  return runYahooSyncCore(userId, tenantId, config, integrationDoc, options, integrationDoc?.id);
}

export async function syncYahooInboxForIntegration(
  integrationId: number,
  options: YahooSyncOptions = {},
  tenantId?: ObjectId
): Promise<YahooSyncRunResult> {
  const { config, integrationDoc } = await resolveYahooConfigByIntegrationId(integrationId, tenantId);
  return runYahooSyncCore(
    integrationDoc.user_id,
    integrationDoc.tenant_id,
    config,
    integrationDoc,
    options,
    integrationDoc.id
  );
}
