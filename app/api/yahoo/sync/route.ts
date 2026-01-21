import { NextRequest, NextResponse } from 'next/server';
import { getYahooConfig, fetchYahooEmails, markEmailAsRead } from '@/lib/yahoo-mail';
import { getDb } from '@/lib/db';
import { suggestTags } from '@/lib/ai-agent';

// POST /api/yahoo/sync - Sync Yahoo Mail inbox
export async function POST(request: NextRequest) {
  try {
    const config = getYahooConfig();
    
    if (!config) {
      return NextResponse.json(
        { 
          error: 'Yahoo Mail not configured. Set YAHOO_EMAIL and YAHOO_PASSWORD (or YAHOO_APP_PASSWORD) in .env',
          synced: 0
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    // Validate input
    const { yahooSyncSchema } = await import('@/lib/validation');
    const validationResult = yahooSyncSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors,
          synced: 0
        },
        { status: 400 }
      );
    }

    const { userId, todayOnly, since: sinceParam } = validationResult.data;
    
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
    console.log('Yahoo sync: Fetching emails since:', since);
    const emails = await fetchYahooEmails(config, since);
    console.log(`Yahoo sync: Found ${emails.length} emails from Yahoo`);

    const db = getDb();
    let syncedCount = 0;

    // Process each email
    for (const email of emails) {
      try {
        console.log('Yahoo sync: Processing email from:', email.from, 'subject:', email.subject);
        
        // Extract contact info
        const emailMatch = email.from.match(/<(.+)>/);
        const emailAddress = emailMatch ? emailMatch[1] : email.from;
        const name = email.from.replace(/<.+>/, '').trim() || emailAddress.split('@')[0];
        
        console.log('Yahoo sync: Extracted email:', emailAddress, 'name:', name);

        // Find or create client
        const { findOrCreateClient, linkConversationToClient } = await import('@/lib/client-matching');
        const client = await findOrCreateClient(
          userId,
          name,
          emailAddress,
          undefined,
          'email'
        );

        // Check if conversation exists
        const existingConv = await db.query(
          `SELECT id FROM conversations 
           WHERE user_id = $1 AND channel = 'email' AND contact_email = $2 
           ORDER BY created_at DESC LIMIT 1`,
          [userId, emailAddress]
        );

        let conversationId: number;

        if (existingConv.rows.length > 0) {
          conversationId = existingConv.rows[0].id;
          // Link to client if not already linked
          if (!existingConv.rows[0].client_id) {
            await linkConversationToClient(conversationId, client.id);
          }
        } else {
          // Create new conversation
          const convResult = await db.query(
            `INSERT INTO conversations (user_id, channel, channel_id, contact_name, contact_email, subject, status, client_id)
             VALUES ($1, 'email', $2, $3, $4, $5, 'open', $6)
             RETURNING id`,
            [userId, email.messageId || email.uid.toString(), name, emailAddress, email.subject, client.id]
          );
          conversationId = convResult.rows[0].id;
        }

        // Check if message already exists (by messageId or UID)
        // First try to find by messageId if available
        let existingMsg: any = null;
        
        if (email.messageId) {
          const msgIdResult = await db.query(
            `SELECT id FROM messages 
             WHERE conversation_id = $1 
             AND content LIKE $2
             ORDER BY sent_at DESC LIMIT 1`,
            [conversationId, `%"messageId":"${email.messageId}"%`]
          );
          if (msgIdResult.rows.length > 0) {
            existingMsg = msgIdResult.rows[0];
          }
        }
        
        // If not found by messageId, try by UID and date
        if (!existingMsg && email.uid) {
          const uidResult = await db.query(
            `SELECT id FROM messages 
             WHERE conversation_id = $1 
             AND sent_at = $2
             ORDER BY sent_at DESC LIMIT 1`,
            [conversationId, email.date]
          );
          if (uidResult.rows.length > 0) {
            existingMsg = uidResult.rows[0];
          }
        }

        if (existingMsg.rows.length === 0) {
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
          };
          
          await db.query(
            `INSERT INTO messages (conversation_id, direction, content, sent_at)
             VALUES ($1, 'inbound', $2, $3)`,
            [conversationId, serializeMessage(storedMessage), email.date]
          );

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
            console.warn('Could not mark email as read:', err);
          }

          syncedCount++;
        }
      } catch (err: any) {
        console.error('Error processing email:', email.uid, err);
        // Continue with next email
      }
    }

    return NextResponse.json({
      success: true,
      synced: syncedCount,
      total: emails.length,
    });
  } catch (error: any) {
    console.error('Error syncing Yahoo Mail:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to sync Yahoo Mail',
        synced: 0
      },
      { status: 500 }
    );
  }
}

// GET /api/yahoo/sync - Test Yahoo connection
export async function GET(request: NextRequest) {
  try {
    const config = getYahooConfig();
    
    if (!config) {
      return NextResponse.json(
        { 
          connected: false,
          error: 'Yahoo Mail not configured'
        }
      );
    }

    const { testYahooConnection } = await import('@/lib/yahoo-mail');
    const connected = await testYahooConnection(config);

    return NextResponse.json({
      connected,
      email: config.email,
    });
  } catch (error: any) {
    console.error('Error testing Yahoo connection:', error);
    return NextResponse.json(
      { 
        connected: false,
        error: error.message
      },
      { status: 500 }
    );
  }
}

