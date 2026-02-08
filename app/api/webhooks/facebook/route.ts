import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, invalidateMongoCache } from '@/lib/db/mongo-utils';
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

    const { userId, senderId, senderName, message, senderEmail, senderPhone } = validationResult.data;

    const db = await getMongoDbOrThrow();

    // Find or create client (use senderId as identifier if no email/phone)
    const client = await findOrCreateClient(
      userId,
      senderName || 'Utilizator Facebook',
      senderEmail,
      senderPhone,
      'facebook'
    );

    const existingConv = await db
      .collection('conversations')
      .find({ user_id: userId, channel: 'facebook', channel_id: senderId })
      .sort({ created_at: -1 })
      .limit(1)
      .next();

    let conversationId: number;

    if (existingConv) {
      conversationId = existingConv.id;
      if (!existingConv.client_id) {
        await linkConversationToClient(conversationId, client.id);
      }
    } else {
      const now = new Date().toISOString();
      conversationId = await getNextNumericId('conversations');
      await db.collection('conversations').insertOne({
        _id: conversationId,
        id: conversationId,
        user_id: userId,
        channel: 'facebook',
        channel_id: senderId,
        contact_name: senderName || 'Utilizator Facebook',
        status: 'open',
        client_id: client.id,
        created_at: now,
        updated_at: now,
      });
      await linkConversationToClient(conversationId, client.id);
    }

    const now = new Date().toISOString();
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

    // Auto-tag
    const suggestedTags = await suggestTags(message);
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

    invalidateMongoCache();
    return createSuccessResponse({ success: true, conversationId });
  } catch (error) {
    return handleApiError(error, 'Failed to process Facebook webhook');
  }
}
