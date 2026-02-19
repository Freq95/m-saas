import { NextRequest } from 'next/server';
import { getMongoDbOrThrow } from '@/lib/db/mongo-utils';
import { createErrorResponse, createSuccessResponse, handleApiError } from '@/lib/error-handler';

// POST /api/conversations/[id]/read
// Body: { read: boolean }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const conversationId = parseInt(params.id, 10);
    if (Number.isNaN(conversationId) || conversationId <= 0) {
      return createErrorResponse('Invalid conversation ID', 400);
    }

    const body = await request.json().catch(() => ({}));
    const read = body?.read !== false;

    const conversation = await db.collection('conversations').findOne({ id: conversationId });
    if (!conversation) {
      return createErrorResponse('Conversation not found', 404);
    }

    if (read) {
      await db.collection('messages').updateMany(
        { conversation_id: conversationId, direction: 'inbound', is_read: false },
        { $set: { is_read: true } }
      );
    } else {
      const latestInbound = await db
        .collection('messages')
        .find({ conversation_id: conversationId, direction: 'inbound' })
        .sort({ sent_at: -1, created_at: -1, id: -1 })
        .limit(1)
        .next();

      if (latestInbound) {
        await db.collection('messages').updateOne(
          { id: latestInbound.id },
          { $set: { is_read: false } }
        );
      }
    }

    const unreadCount = await db.collection('messages').countDocuments({
      conversation_id: conversationId,
      direction: 'inbound',
      is_read: false,
    });
    return createSuccessResponse({
      success: true,
      conversationId,
      hasUnread: unreadCount > 0,
      read: unreadCount === 0,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to update read status');
  }
}
