import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { suggestTags } from '@/lib/ai-agent';
import { findOrCreateClient, linkConversationToClient } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';

// POST /api/webhooks/form - Webhook for form submissions from website
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const { formWebhookSchema } = await import('@/lib/validation');
    const validationResult = formWebhookSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          error: 'Invalid input',
          details: validationResult.error.errors
        },
        { status: 400 }
      );
    }

    const { userId, name, email, phone, message, subject } = validationResult.data;

    const db = getDb();

    // Find or create client
    const client = await findOrCreateClient(
      userId,
      name || 'Anonim',
      email,
      phone,
      'form'
    );

    // Create conversation
    const convResult = await db.query(
      `INSERT INTO conversations (user_id, channel, contact_name, contact_email, contact_phone, subject, status, client_id, created_at, updated_at)
       VALUES ($1, 'form', $2, $3, $4, $5, 'open', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id`,
      [userId, name || 'Anonim', email, phone, subject || 'Formular site', client.id]
    );

    const conversationId = convResult.rows[0].id;

    // Link conversation to client (update last_conversation_date)
    await linkConversationToClient(conversationId, client.id);

    // Add message
    await db.query(
      `INSERT INTO messages (conversation_id, direction, content, sent_at)
       VALUES ($1, 'inbound', $2, CURRENT_TIMESTAMP)`,
      [conversationId, message]
    );

    // Auto-tag as "Lead nou"
    const tagResult = await db.query('SELECT id FROM tags WHERE LOWER(name) = LOWER($1)', ['Lead nou']);
    if (tagResult.rows.length > 0) {
      await db.query(
        `INSERT INTO conversation_tags (conversation_id, tag_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [conversationId, tagResult.rows[0].id]
      );
    }

    return createSuccessResponse({ success: true, conversationId });
  } catch (error) {
    return handleApiError(error, 'Failed to process form webhook');
  }
}

