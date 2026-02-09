import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
import { getMongoDbOrThrow, invalidateMongoCache, stripMongoId } from '@/lib/db/mongo-utils';
import { handleApiError, createSuccessResponse, createErrorResponse } from '@/lib/error-handler';
import { getConversationMessagesData } from '@/lib/server/inbox';

// GET /api/conversations/[id] - Get conversation with messages
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const conversationId = parseInt(params.id);

    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const beforeId = searchParams.get('beforeId');

    // Get conversation
    const messageData = await getConversationMessagesData(conversationId, {
      limit,
      offset,
      beforeId: beforeId ? parseInt(beforeId) : undefined,
    });

    if (!messageData.conversation) {
      return NextResponse.json(
        { conversation: null, messages: [] },
        { status: 404 }
      );
    }
    return createSuccessResponse({
      conversation: messageData.conversation,
      messages: messageData.messages,
      hasMore: messageData.hasMore,
      oldestMessageId: messageData.oldestMessageId,
    });
  } catch (error) {
    return handleApiError(error, 'Failed to fetch conversation');
  }
}

// PATCH /api/conversations/[id] - Update conversation
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = await getMongoDbOrThrow();
    const conversationId = parseInt(params.id);
    const body = await request.json();

    // Validate conversation exists
    const existingConv = await db.collection('conversations').findOne({ id: conversationId });
    if (!existingConv) {
      return createErrorResponse('Conversation not found', 404);
    }

    // Validate input
    const { updateConversationSchema } = await import('@/lib/validation');
    const validationResult = updateConversationSchema.safeParse(body);
    if (!validationResult.success) {
      return createErrorResponse('Invalid input', 400, JSON.stringify(validationResult.error.errors));
    }

    const updates: Record<string, unknown> = {};
    const validatedData = validationResult.data;

    if (validatedData.contactName !== undefined) {
      updates.contact_name = validatedData.contactName.trim();
    }

    if (validatedData.contactEmail !== undefined) {
      updates.contact_email = validatedData.contactEmail ? validatedData.contactEmail.toLowerCase().trim() : null;
    }

    if (validatedData.contactPhone !== undefined) {
      updates.contact_phone = validatedData.contactPhone ? validatedData.contactPhone.trim() : null;
    }

    if (validatedData.subject !== undefined) {
      updates.subject = validatedData.subject || null;
    }

    if (validatedData.clientId !== undefined) {
      updates.client_id = validatedData.clientId || null;
    }

    let tagsUpdated = false;

    if (validatedData.tags !== undefined && Array.isArray(validatedData.tags)) {
      tagsUpdated = true;
      await db.collection('conversation_tags').deleteMany({ conversation_id: conversationId });

      if (validatedData.tags.length > 0) {
        const allTags = await db.collection('tags').find({}).toArray();
        const tagsByName = new Map<string, any>();
        for (const tag of allTags) {
          if (typeof tag.name === 'string') {
            tagsByName.set(tag.name.toLowerCase(), tag);
          }
        }

        const newConvTags = validatedData.tags
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
    }

    if (Object.keys(updates).length > 0 || tagsUpdated) {
      updates.updated_at = new Date().toISOString();
      await db.collection('conversations').updateOne(
        { id: conversationId },
        { $set: updates }
      );
      invalidateMongoCache();
    }

    const updatedDoc = await db.collection('conversations').findOne({ id: conversationId });
    if (!updatedDoc) {
      return createErrorResponse('Conversation not found', 404);
    }

    const tagsResult = await db.collection('tags').find({}).toArray();
    const allTags = tagsResult.map(stripMongoId);
    const convTagsResult = await db
      .collection('conversation_tags')
      .find({ conversation_id: conversationId })
      .toArray();
    const tagIds = convTagsResult.map((r: any) => r.tag_id);
    const tags = allTags
      .filter((t: any) => tagIds.includes(t.id))
      .map((t: any) => t.name);

    return createSuccessResponse({
      success: true,
      conversation: {
        ...stripMongoId(updatedDoc),
        tags,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Failed to update conversation');
  }
}
