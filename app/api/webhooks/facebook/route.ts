import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { suggestTags } from '@/lib/ai-agent';
import { findOrCreateClient, linkConversationToClient } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// POST /api/webhooks/facebook - Webhook for Facebook Page messages
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const { facebookWebhookSchema } = await import('@/lib/validation');
    const validationResult = facebookWebhookSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const { userId, senderId, senderName, message, pageId, senderEmail, senderPhone } = validationResult.data;

    const db = getDb();

    // Find or create client (use senderId as identifier if no email/phone)
    const client = await findOrCreateClient(
      userId,
      senderName || 'Utilizator Facebook',
      senderEmail,
      senderPhone,
      'facebook'
    );

    // Check if conversation exists
    const existingConv = await db.query(
      `SELECT id, client_id FROM conversations 
       WHERE user_id = $1 AND channel = 'facebook' AND channel_id = $2 
       ORDER BY created_at DESC LIMIT 1`,
      [userId, senderId]
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
          `INSERT INTO conversations (user_id, channel, channel_id, contact_name, status, client_id, created_at, updated_at)
           VALUES ($1, 'facebook', $2, $3, 'open', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING id`,
          [userId, senderId, senderName || 'Utilizator Facebook', client.id]
        );
      conversationId = convResult.rows[0].id;
      // Link conversation to client
      await linkConversationToClient(conversationId, client.id);
    }

    // Add message
    await db.query(
      `INSERT INTO messages (conversation_id, direction, content, sent_at)
       VALUES ($1, 'inbound', $2, CURRENT_TIMESTAMP)`,
      [conversationId, message]
    );

    // Auto-tag
    const suggestedTags = await suggestTags(message);
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
    return handleApiError(error, 'Failed to process Facebook webhook');
  }
}

