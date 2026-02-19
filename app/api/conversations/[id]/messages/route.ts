import { NextRequest } from 'next/server';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId } from '@/lib/db/mongo-utils';
import { getYahooConfig, sendYahooEmail } from '@/lib/yahoo-mail';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';

// POST /api/conversations/[id]/messages - Send message
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const conversationId = parseInt(params.id);
    const body = await request.json();

    // Validate input
    const { createMessageSchema } = await import('@/lib/validation');
    const validationResult = createMessageSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const { content, direction } = validationResult.data;

    // Get conversation to check channel
    const conversationDoc = await db.collection('conversations').findOne({ id: conversationId });

    if (!conversationDoc) {
      return createErrorResponse('Conversation not found', 404);
    }

    const conversation = stripMongoId(conversationDoc);
    const now = new Date().toISOString();

    // Save message to database
    const messageId = await getNextNumericId('messages');
    const newMessage = {
      _id: messageId,
      id: messageId,
      conversation_id: conversationId,
      direction,
      content,
      is_read: direction === 'outbound',
      sent_at: now,
      created_at: now,
    };

    await db.collection('messages').insertOne(newMessage);

    // If it's an outbound email message, send via Yahoo
    if (direction === 'outbound' && conversation.channel === 'email' && conversation.contact_email) {
      try {
        const yahooConfig = await getYahooConfig(Number(conversation.user_id));
        if (yahooConfig) {
          await sendYahooEmail(
            yahooConfig,
            conversation.contact_email,
            `Re: ${conversation.subject || 'Mesaj'}`,
            content
          );
        }
      } catch (emailError) {
        const { logger } = await import('@/lib/logger');
        logger.error('Error sending email via Yahoo', emailError instanceof Error ? emailError : new Error(String(emailError)), { conversationId });
        // Don't fail the request if email sending fails
      }
    }

    // Update conversation updated_at
    await db.collection('conversations').updateOne(
      { id: conversationId },
      { $set: { updated_at: now } }
    );
    return createSuccessResponse({ message: stripMongoId(newMessage) }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to send message');
  }
}
