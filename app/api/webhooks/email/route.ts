import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, invalidateMongoCache } from '@/lib/db/mongo-utils';
import { suggestTags } from '@/lib/ai-agent';
import { findOrCreateClient, linkConversationToClient } from '@/lib/client-matching';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { DEFAULT_USER_ID } from '@/lib/constants';

// POST /api/webhooks/email - Webhook for receiving emails (Gmail/Outlook)
export async function POST(request: NextRequest) {
  try {
    const db = await getMongoDbOrThrow();
    const body = await request.json();
    const { userId = DEFAULT_USER_ID, from, to, subject, text, html } = body;

    // Extract contact info
    const emailMatch = from.match(/<(.+)>/);
    const email = emailMatch ? emailMatch[1] : from;
    const name = from.replace(/<.+>/, '').trim() || email.split('@')[0];

    // Find or create client
    const client = await findOrCreateClient(
      userId,
      name || email,
      email,
      undefined,
      'email'
    );

    const existingConv = await db
      .collection('conversations')
      .find({ user_id: userId, channel: 'email', contact_email: email })
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
        channel: 'email',
        contact_name: name,
        contact_email: email,
        subject: subject || null,
        created_at: now,
        updated_at: now,
      });
      await linkConversationToClient(conversationId, client.id);
    }

    const now = new Date().toISOString();
    const content = text || html?.replace(/<[^>]*>/g, '') || '';
    const messageId = await getNextNumericId('messages');
    await db.collection('messages').insertOne({
      _id: messageId,
      id: messageId,
      conversation_id: conversationId,
      direction: 'inbound',
      content,
      is_read: false,
      sent_at: now,
      created_at: now,
    });

    // Auto-tag
    const suggestedTags = await suggestTags(content);
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
    return handleApiError(error, 'Failed to process email webhook');
  }
}
