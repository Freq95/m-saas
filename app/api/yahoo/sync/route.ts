import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
import { getYahooConfig, fetchYahooEmails, markEmailAsRead } from '@/lib/yahoo-mail';
import { getMongoDbOrThrow, getNextNumericId, invalidateMongoCache } from '@/lib/db/mongo-utils';
import { suggestTags } from '@/lib/ai-agent';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import * as fs from 'fs';
import * as path from 'path';

const EMAIL_ATTACHMENT_DIR = path.join(process.cwd(), 'uploads', 'email-attachments');

if (!fs.existsSync(EMAIL_ATTACHMENT_DIR)) {
  fs.mkdirSync(EMAIL_ATTACHMENT_DIR, { recursive: true });
}

// POST /api/yahoo/sync - Sync Yahoo Mail inbox
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const { yahooSyncSchema } = await import('@/lib/validation');
    const validationResult = yahooSyncSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const { userId, todayOnly, since: sinceParam, enableAiTagging, markAsRead } = validationResult.data;

    // Get config from database (with env fallback)
    const config = await getYahooConfig(userId);

    if (!config) {
      return createErrorResponse(
        'Yahoo Mail not configured. Please configure it in Settings > Email Integrations or set YAHOO_EMAIL and YAHOO_PASSWORD (or YAHOO_APP_PASSWORD) in .env',
        400
      );
    }

    // If todayOnly is true, only sync emails from today
    let since: Date | undefined;
    if (todayOnly) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      since = today;
    } else if (sinceParam) {
      since = typeof sinceParam === 'string' ? new Date(sinceParam) : sinceParam;
    }

    const db = await getMongoDbOrThrow();

    // Resolve integration doc to use UID cursor for incremental sync.
    const integrationDoc = userId
      ? await db
          .collection('email_integrations')
          .find({ user_id: userId, provider: 'yahoo', email: config.email, is_active: true })
          .sort({ created_at: -1 })
          .limit(1)
          .next()
      : null;

    const lastSyncedUid =
      integrationDoc && typeof integrationDoc.last_synced_uid === 'number'
        ? integrationDoc.last_synced_uid
        : undefined;

    // Fetch emails from Yahoo
    const { logger } = await import('@/lib/logger');
    logger.info('Yahoo sync: Fetching emails', {
      since: since?.toISOString(),
      sinceUid: lastSyncedUid ?? null,
    });
    const emails = await fetchYahooEmails(config, since, lastSyncedUid);
    logger.info('Yahoo sync: Found emails', {
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
      const allTags = await db.collection('tags').find({}).toArray();
      tagsByName = new Map<string, any>();
      for (const tag of allTags) {
        if (typeof tag.name === 'string') {
          tagsByName.set(tag.name.toLowerCase(), tag);
        }
      }
    }

    // Process each email
    for (const email of emails) {
      try {
        if (typeof email.uid === 'number' && email.uid > maxFetchedUid) {
          maxFetchedUid = email.uid;
        }

        logger.debug('Yahoo sync: Processing email', { from: email.from, subject: email.subject });

        // Extract contact info
        const emailMatch = email.from.match(/<(.+)>/);
        const emailAddress = emailMatch ? emailMatch[1] : email.from;
        const name = email.from.replace(/<.+>/, '').trim() || emailAddress.split('@')[0];

        logger.debug('Yahoo sync: Extracted contact info', { email: emailAddress, name });

        // Find or create client (non-blocking for inbox sync)
        let client: { id: number } | null = null;
        const { findOrCreateClient, linkConversationToClient } = await import('@/lib/client-matching');
        try {
          client = await findOrCreateClient(
            userId,
            name,
            emailAddress,
            undefined,
            'email'
          );
        } catch (clientError) {
          logger.warn('Yahoo sync: Failed to resolve client, continuing without client link', {
            email: emailAddress,
            error: clientError instanceof Error ? clientError.message : String(clientError),
          });
        }

        const existingConv = await db
          .collection('conversations')
          .find({ user_id: userId, channel: 'email', contact_email: emailAddress })
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

        // Check if message already exists (by messageId or UID)
        let existingMsg: { id: number } | null = null;
        if (email.messageId || email.uid) {
          existingMsg = await db
            .collection('messages')
            .findOne({
              conversation_id: conversationId,
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
            const sanitizedName = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');

            // Keep metadata visible even if raw bytes are unavailable.
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
              const storedFilename = `${conversationId}_${messageId}_${attachmentId}_${Date.now()}_${sanitizedName}`;
              const storedPath = path.join(EMAIL_ATTACHMENT_DIR, storedFilename);
              fs.writeFileSync(storedPath, att.content);

              await db.collection('message_attachments').insertOne({
                _id: attachmentId,
                id: attachmentId,
                user_id: userId,
                conversation_id: conversationId,
                message_id: messageId,
                original_filename: originalFilename,
                filename: storedFilename,
                file_path: storedPath,
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
            images: email.images?.map(img => ({
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
            conversation_id: conversationId,
            direction: 'inbound',
            content: serializeMessage(storedMessage),
            is_read: false,
            sent_at: sentAtIso,
            created_at: sentAtIso,
            external_id: email.messageId || null,
            source_uid: email.uid || null,
          });

          // Keep conversation fresh for sorting
          await db.collection('conversations').updateOne(
            { id: conversationId },
            { $set: { updated_at: sentAtIso } }
          );

          // Ensure conversation is linked to client if available and missing
          if (client && !existingClientId) {
            try {
              await linkConversationToClient(conversationId, client.id);
            } catch (linkError) {
              logger.warn('Yahoo sync: Failed to link conversation to client', {
                conversationId,
                error: linkError instanceof Error ? linkError.message : String(linkError),
              });
            }
          }

          // Auto-tag (disabled by default; it's expensive during bulk sync)
          if (enableAiTagging && tagsByName) {
            const suggestedTags = await suggestTags(email.text);
            if (suggestedTags.length > 0) {
              const newConvTags = suggestedTags
                .map((tagName) => tagsByName?.get(tagName.toLowerCase()))
                .filter(Boolean)
                .map((tag: any) => ({
                  _id: `${conversationId}:${tag.id}`,
                  conversation_id: conversationId,
                  tag_id: tag.id,
                }));

              if (newConvTags.length > 0) {
                await db.collection('conversation_tags').insertMany(newConvTags, { ordered: false });
                taggedCount += newConvTags.length;
              }
            }
          }

          // Mark email as read (disabled by default; opens extra IMAP calls)
          if (markAsRead && email.uid) {
            try {
              await markEmailAsRead(config, email.uid);
            } catch (err) {
              logger.warn('Could not mark email as read', { uid: email.uid, error: err instanceof Error ? err.message : String(err) });
            }
          }

          syncedCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        errorCount++;
        logger.error('Error processing email', err instanceof Error ? err : new Error(String(err)), { uid: email.uid });
        // Continue with next email
      }
    }

    // Update integration sync cursor/time if using database config
    if (userId && integrationDoc) {
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
          { id: integrationDoc.id },
          { $set: setValues }
        );
      } catch (err) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to update integration sync cursor/time', { error: err });
      }
    }

    invalidateMongoCache();
    return createSuccessResponse({
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
    });
  } catch (error) {
    return handleApiError(error, 'Failed to sync Yahoo Mail');
  }
}

// GET /api/yahoo/sync - Test Yahoo connection
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = parseInt(searchParams.get('userId') || '1');

    const config = await getYahooConfig(userId);

    if (!config) {
      return createSuccessResponse({
        connected: false,
        error: 'Yahoo Mail not configured',
      });
    }

    const { testYahooConnection } = await import('@/lib/yahoo-mail');
    const connected = await testYahooConnection(config);

    return createSuccessResponse({
      connected,
      email: config.email,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to test Yahoo connection');
  }
}
