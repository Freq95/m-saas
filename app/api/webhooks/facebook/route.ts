import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { suggestTags } from '@/lib/ai-agent';

// POST /api/webhooks/facebook - Webhook for Facebook Page messages
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId = 1, senderId, senderName, message, pageId } = body;

    if (!message || !senderId) {
      return NextResponse.json(
        { error: 'Message and senderId are required' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Check if conversation exists
    const existingConv = await db.query(
      `SELECT id FROM conversations 
       WHERE user_id = $1 AND channel = 'facebook' AND channel_id = $2 
       ORDER BY created_at DESC LIMIT 1`,
      [userId, senderId]
    );

    let conversationId: number;

    if (existingConv.rows.length > 0) {
      conversationId = existingConv.rows[0].id;
    } else {
      // Create new conversation
      const convResult = await db.query(
        `INSERT INTO conversations (user_id, channel, channel_id, contact_name, status)
         VALUES ($1, 'facebook', $2, $3, 'open')
         RETURNING id`,
        [userId, senderId, senderName || 'Utilizator Facebook']
      );
      conversationId = convResult.rows[0].id;
    }

    // Add message
    await db.query(
      `INSERT INTO messages (conversation_id, direction, content)
       VALUES ($1, 'inbound', $2)`,
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

    return NextResponse.json({ success: true, conversationId });
  } catch (error: any) {
    console.error('Error processing Facebook webhook:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

