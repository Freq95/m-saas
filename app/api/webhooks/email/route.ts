import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { suggestTags } from '@/lib/ai-agent';
import { findOrCreateClient, linkConversationToClient } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { DEFAULT_USER_ID } from '@/lib/constants';

// POST /api/webhooks/email - Webhook for receiving emails (Gmail/Outlook)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId = DEFAULT_USER_ID, from, to, subject, text, html } = body;

    // Extract contact info
    const emailMatch = from.match(/<(.+)>/);
    const email = emailMatch ? emailMatch[1] : from;
    const name = from.replace(/<.+>/, '').trim() || email.split('@')[0];

    const db = getDb();

    // Find or create client
    const client = await findOrCreateClient(
      userId,
      name || email,
      email,
      undefined,
      'email'
    );

    // Check if conversation exists
    const existingConv = await db.query(
      `SELECT id, client_id FROM conversations 
       WHERE user_id = $1 AND channel = 'email' AND contact_email = $2 
       ORDER BY created_at DESC LIMIT 1`,
      [userId, email]
    );

    let conversationId: number;

    if (existingConv.rows.length > 0) {
      conversationId = existingConv.rows[0].id;
      if (!existingConv.rows[0].client_id) {
        await linkConversationToClient(conversationId, client.id);
      }
    } else {
      // Create new conversation
      const convResult = await db.query(
        `INSERT INTO conversations (user_id, channel, contact_name, contact_email, subject, status, created_at, updated_at)
         VALUES ($1, 'email', $2, $3, $4, 'open', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [userId, name, email, subject]
      );
      conversationId = convResult.rows[0].id;
      await linkConversationToClient(conversationId, client.id);
    }

    // Add message
    const content = text || html?.replace(/<[^>]*>/g, '') || '';
    await db.query(
      `INSERT INTO messages (conversation_id, direction, content, sent_at)
       VALUES ($1, 'inbound', $2, CURRENT_TIMESTAMP)`,
      [conversationId, content]
    );

    // Auto-tag
    const suggestedTags = await suggestTags(content);
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

    return createSuccessResponse({ success: true, conversationId });
  } catch (error) {
    return handleApiError(error, 'Failed to process email webhook');
  }
}

