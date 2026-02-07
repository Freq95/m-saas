import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
import { getYahooConfig, fetchYahooEmails, markEmailAsRead } from '@/lib/yahoo-mail';
import { getMongoDbOrThrow, getNextNumericId, invalidateMongoCache } from '@/lib/db/mongo-utils';
import { suggestTags } from '@/lib/ai-agent';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

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

    const { userId, todayOnly, since: sinceParam } = validationResult.data;

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

    // Fetch emails from Yahoo
    const { logger } = await import('@/lib/logger');
    logger.info('Yahoo sync: Fetching emails', { since: since?.toISOString() });
    const emails = await fetchYahooEmails(config, since);
    logger.info('Yahoo sync: Found emails', { count: emails.length });

    const db = await getMongoDbOrThrow();
    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process each email
    for (const email of emails) {
      try {
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
            status: 'open',
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

          const storedMessage = {
            text: email.cleanText || email.text || '',
            html: email.html,
            images: email.images?.map(img => ({
              url: img.url,
              cid: img.cid,
              data: img.data,
              contentType: img.contentType,
            })),
            attachments: email.attachments?.map(att => ({
              filename: att.filename,
              contentType: att.contentType,
              size: att.size,
            })),
            messageId: email.messageId,
            uid: email.uid,
          };

          const sentAt = email.date || new Date();
          const messageId = await getNextNumericId('messages');
          await db.collection('messages').insertOne({
            _id: messageId,
            id: messageId,
            conversation_id: conversationId,
            direction: 'inbound',
            content: serializeMessage(storedMessage),
            sent_at: sentAt.toISOString(),
            created_at: sentAt.toISOString(),
            external_id: email.messageId || null,
            source_uid: email.uid || null,
          });

          // Keep conversation fresh for sorting
          await db.collection('conversations').updateOne(
            { id: conversationId },
            { $set: { updated_at: sentAt.toISOString() } }
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

          // Auto-tag
          const suggestedTags = await suggestTags(email.text);
          if (suggestedTags.length > 0) {
            const allTags = await db.collection('tags').find({}).toArray();
            const tagsByName = new Map<string, any>();
            for (const tag of allTags) {
              if (typeof tag.name === 'string') {
                tagsByName.set(tag.name.toLowerCase(), tag);
              }
            }

            const newConvTags = suggestedTags
              .map((tagName) => tagsByName.get(tagName.toLowerCase()))
              .filter(Boolean)
              .map((tag: any) => ({
                _id: `${conversationId}:${tag.id}`,
                conversation_id: conversationId,
                tag_id: tag.id,
              }));

            if (newConvTags.length > 0) {
              await db.collection('conversation_tags').insertMany(newConvTags, { ordered: false });
            }
          }

          // Mark email as read in Yahoo
          try {
            await markEmailAsRead(config, email.uid);
          } catch (err) {
            logger.warn('Could not mark email as read', { uid: email.uid, error: err instanceof Error ? err.message : String(err) });
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

    // Update integration sync time if using database config
    if (userId) {
      try {
        const { getEmailIntegrationById, updateIntegrationSyncTime } = await import('@/lib/email-integrations');
        const integrations = await getEmailIntegrationById(0, userId); // We need to find by email
        // Find integration by email
        const { getUserEmailIntegrations } = await import('@/lib/email-integrations');
        const userIntegrations = await getUserEmailIntegrations(userId);
        const yahooIntegration = userIntegrations.find(i => i.provider === 'yahoo' && i.email === config.email);
        if (yahooIntegration) {
          await updateIntegrationSyncTime(yahooIntegration.id);
        }
      } catch (err) {
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to update integration sync time', { error: err });
      }
    }

    invalidateMongoCache();
    return createSuccessResponse({
      success: true,
      synced: syncedCount,
      skipped: skippedCount,
      errors: errorCount,
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
