import { NextRequest, NextResponse } from 'next/server';
import { getYahooConfig, fetchYahooEmails, markEmailAsRead } from '@/lib/yahoo-mail';
import { getDb } from '@/lib/db';
import { suggestTags } from '@/lib/ai-agent';
import { getTodayInRomania } from '@/lib/timezone';

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
    
    // If todayOnly is true, only sync emails from today (in Romania timezone)
    let since: Date | undefined;
    if (todayOnly) {
      // CRITICAL FIX: Use Romania timezone, not server local timezone
      since = getTodayInRomania();
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

        // Check if message already exists - use time range to handle timestamp precision differences
        // This handles timestamp precision differences and timezone issues
        let existingMsg: any = null;
        
        if (email.date) {
          let emailDate: Date = email.date instanceof Date ? email.date : new Date(email.date);
          if (isNaN(emailDate.getTime())) {
            emailDate = new Date();
          }
          
          // Use a 5-minute window to account for timestamp precision differences and timezone issues
          // This is more lenient than before to ensure we don't miss messages
          const dateStart = new Date(emailDate.getTime() - 300000); // 5 minutes before
          const dateEnd = new Date(emailDate.getTime() + 300000);   // 5 minutes after
          
          const dateResult = await db.query(
            `SELECT id, sent_at FROM messages 
             WHERE conversation_id = $1 
             AND sent_at >= $2 AND sent_at <= $3
             ORDER BY sent_at DESC LIMIT 1`,
            [conversationId, dateStart, dateEnd]
          );
          
          if (dateResult.rows.length > 0) {
            existingMsg = dateResult.rows[0];
            console.log(`Yahoo sync: Found existing message for email ${email.uid} (time diff: ${Math.abs(new Date(dateResult.rows[0].sent_at).getTime() - emailDate.getTime())}ms)`);
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
          };
          
          // Ensure email.date is a valid Date object
          let emailDate: Date = email.date instanceof Date ? email.date : new Date(email.date);
          if (isNaN(emailDate.getTime())) {
            console.warn(`Invalid email date for email ${email.uid}, using current date`);
            emailDate = new Date();
          }
          
          // CRITICAL FIX: If syncing with todayOnly=true, ensure emails are marked as today
          // Email Date headers might be in UTC or sender's timezone, causing them to appear as yesterday
          // If the email date is within the last 24 hours, use current time to ensure it shows as "today"
          if (todayOnly) {
            const now = new Date();
            const emailTime = emailDate.getTime();
            const hoursDiff = (now.getTime() - emailTime) / (1000 * 60 * 60);
            
            // If email is from the last 24 hours, use current time to ensure it's marked as today
            if (hoursDiff >= 0 && hoursDiff < 24) {
              console.log(`Yahoo sync: Email date ${emailDate.toISOString()} is ${hoursDiff.toFixed(2)} hours ago, using current time for today's sync`);
              emailDate = new Date(); // Use current time to ensure it's marked as today
            }
          }
          
          console.log(`Yahoo sync: Inserting new message for conversation ${conversationId}, date: ${emailDate.toISOString()}`);
          
          await db.query(
            `INSERT INTO messages (conversation_id, direction, content, sent_at)
             VALUES ($1, 'inbound', $2, $3)`,
            [conversationId, serializeMessage(storedMessage), emailDate]
          );

          // Update conversation's updated_at and last_message_at to reflect new message
          // This ensures the conversation appears in today's filter if the message is from today
          // Try to update last_message_at, but handle case where column might not exist
          try {
            await db.query(
              `UPDATE conversations 
               SET updated_at = CURRENT_TIMESTAMP, 
                   last_message_at = $2
               WHERE id = $1`,
              [conversationId, emailDate]
            );
            console.log(`Yahoo sync: Updated last_message_at for conversation ${conversationId} to ${emailDate.toISOString()}`);
          } catch (updateError: any) {
            // If last_message_at column doesn't exist, just update updated_at
            if (updateError.message?.includes('last_message_at')) {
              console.warn(`Yahoo sync: last_message_at column not found, updating only updated_at`);
              await db.query(
                `UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [conversationId]
              );
            } else {
              throw updateError;
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
            console.warn('Could not mark email as read:', err);
          }

          syncedCount++;
        }
      } catch (err: any) {
        console.error(`Error processing email ${email.uid}:`, err.message || err);
        // Continue with next email
      }
    }

    console.log(`✅ Yahoo sync: ${syncedCount} new emails synced (${emails.length} total found)`);
    
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

