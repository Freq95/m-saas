import { NextRequest, NextResponse } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, invalidateMongoCache } from '@/lib/db/mongo-utils';
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
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { userId, name, email, phone, message, subject } = validationResult.data;

    const db = await getMongoDbOrThrow();

    // Find or create client
    const client = await findOrCreateClient(
      userId,
      name || 'Anonim',
      email,
      phone,
      'form'
    );

    const now = new Date().toISOString();
    const conversationId = await getNextNumericId('conversations');
    await db.collection('conversations').insertOne({
      _id: conversationId,
      id: conversationId,
      user_id: userId,
      channel: 'form',
      contact_name: name || 'Anonim',
      contact_email: email || null,
      contact_phone: phone || null,
      subject: subject || 'Formular site',
      client_id: client.id,
      created_at: now,
      updated_at: now,
    });

    // Link conversation to client (update last_conversation_date)
    await linkConversationToClient(conversationId, client.id);

    // Add message
    const messageId = await getNextNumericId('messages');
    await db.collection('messages').insertOne({
      _id: messageId,
      id: messageId,
      conversation_id: conversationId,
      direction: 'inbound',
      content: message,
      is_read: false,
      sent_at: now,
      created_at: now,
    });

    // Auto-tag as "Lead nou"
    const tag = await db.collection('tags').findOne({ name: { $regex: '^Lead nou$', $options: 'i' } });
    if (tag) {
      await db.collection('conversation_tags').updateOne(
        { _id: `${conversationId}:${tag.id}` },
        {
          $setOnInsert: {
            conversation_id: conversationId,
            tag_id: tag.id,
          },
        },
        { upsert: true }
      );
    }

    invalidateMongoCache();
    return createSuccessResponse({ success: true, conversationId });
  } catch (error) {
    return handleApiError(error, 'Failed to process form webhook');
  }
}
