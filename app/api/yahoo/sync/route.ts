import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getYahooConfig, fetchYahooEmails, markEmailAsRead } from '@/lib/yahoo-mail';
import { getDb } from '@/lib/db';
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

    const db = getDb();
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

        // Check if conversation exists
        const existingConv = await db.query(
          `SELECT id, client_id FROM conversations 
           WHERE user_id = $1 AND channel = 'email' AND contact_email = $2 
           ORDER BY created_at DESC LIMIT 1`,
          [userId, emailAddress]
        );

        let conversationId: number;

        if (existingConv.rows.length > 0) {
          conversationId = existingConv.rows[0].id;
        } else {
          // Create new conversation
          const convResult = await db.query(
            `INSERT INTO conversations (user_id, channel, channel_id, contact_name, contact_email, subject, status, client_id, created_at, updated_at)
             VALUES ($1, 'email', $2, $3, $4, $5, 'open', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING id`,
            [userId, email.messageId || email.uid.toString(), name, emailAddress, email.subject, client?.id || null]
          );
          conversationId = convResult.rows[0].id;
        }

        // Check if message already exists (by messageId or UID)
        let existingMsg: { id: number } | null = null;
        if (email.messageId || email.uid) {
          const msgCheck = await db.query(
            `SELECT id FROM messages
             WHERE conversation_id = $1
             AND (
               (external_id IS NOT NULL AND external_id = $2)
               OR (source_uid IS NOT NULL AND source_uid = $3)
             )
             ORDER BY sent_at DESC LIMIT 1`,
            [conversationId, email.messageId || null, email.uid || null]
          );
          if (msgCheck.rows.length > 0) {
            existingMsg = msgCheck.rows[0] as { id: number };
          }
        }

        if (!existingMsg) {
          // Store message using standardized format
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
          await db.query(
            `INSERT INTO messages (conversation_id, direction, content, sent_at, external_id, source_uid)
             VALUES ($1, 'inbound', $2, $3, $4, $5)`,
            [conversationId, serializeMessage(storedMessage), sentAt, email.messageId || null, email.uid || null]
          );

          // Keep conversation fresh for sorting (even if message parsing fails later)
          await db.query(
            `UPDATE conversations SET updated_at = $1 WHERE id = $2`,
            [sentAt, conversationId]
          );

          // Ensure conversation is linked to client if available and missing
          if (client && !existingConv.rows[0]?.client_id) {
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
            for (const tagName of suggestedTags) {
              const tagResult = await db.query('SELECT id FROM tags WHERE LOWER(name) = LOWER($1)', [tagName]);
              if (tagResult.rows.length > 0) {
                await db.query(
                  `INSERT INTO conversation_tags (conversation_id, tag_id)
                   VALUES ($1, $2)
                   ON CONFLICT DO NOTHING`,
                  [conversationId, tagResult.rows[0].id]
                );
              }
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
        // Non-critical, just log
        const { logger } = await import('@/lib/logger');
        logger.warn('Failed to update integration sync time', { error: err });
      }
    }

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
        error: 'Yahoo Mail not configured'
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

