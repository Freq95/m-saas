import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getMongoDbOrThrow, getNextNumericId, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse } from '@/lib/error-handler';
import { getConversationsData } from '@/lib/server/inbox';
import { getAuthUser } from '@/lib/auth-helpers';

// GET /api/conversations - Get all conversations from storage
export async function GET(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const searchParams = request.nextUrl.searchParams;
    const { conversationsQuerySchema } = await import('@/lib/validation');
    const queryParams = {
      userId: String(userId),
      search: searchParams.get('search') || undefined,
    };
    const validationResult = conversationsQuerySchema.safeParse(queryParams);
    if (!validationResult.success) {
      return handleApiError(validationResult.error, 'Invalid query parameters');
    }

    const { search } = validationResult.data;
    const conversations = await getConversationsData({ userId, tenantId, search });

    return createSuccessResponse({ conversations });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch conversations');
  }
}

// POST /api/conversations - Create new conversation
export async function POST(request: NextRequest) {
  try {
    const { userId, tenantId } = await getAuthUser();
    const db = await getMongoDbOrThrow();
    const body = await request.json();

    // Validate input
    const { createConversationSchema } = await import('@/lib/validation');
    const validationResult = createConversationSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid input',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const { channel, channelId, contactName, contactEmail, contactPhone, subject, initialMessage } = validationResult.data;
    const now = new Date().toISOString();
    const conversationId = await getNextNumericId('conversations');

    const conversationDoc = {
      _id: conversationId,
      id: conversationId,
      tenant_id: tenantId,
      user_id: userId,
      channel,
      channel_id: channelId || '',
      contact_name: contactName,
      contact_email: contactEmail || null,
      contact_phone: contactPhone || null,
      subject: subject || 'Fara subiect',
      created_at: now,
      updated_at: now,
    };

    await db.collection('conversations').insertOne(conversationDoc);
    const conversation = stripMongoId(conversationDoc);

    // Add initial message if provided
    if (initialMessage) {
      const messageId = await getNextNumericId('messages');
      await db.collection('messages').insertOne({
        _id: messageId,
        id: messageId,
        tenant_id: tenantId,
        conversation_id: conversationId,
        direction: 'inbound',
        content: initialMessage,
        is_read: false,
        sent_at: now,
        created_at: now,
      });
    }
    return createSuccessResponse({ conversation }, 201);
  } catch (error) {
    return handleApiError(error, 'Failed to create conversation');
  }
}
