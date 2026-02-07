import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { parseStoredMessage } from '@/lib/email-types';

type InboxStatus = 'all' | 'open' | 'closed' | 'pending';

type MessagePagination = {
  limit?: number;
  offset?: number;
  beforeId?: number;
};

export async function getConversationsData(userId: number, status: InboxStatus = 'all') {
  const db = await getMongoDbOrThrow();

  const conversationFilter: Record<string, unknown> = { user_id: userId };
  if (status !== 'all') {
    conversationFilter.status = status;
  }

  const conversations = (await db
    .collection('conversations')
    .find(conversationFilter)
    .sort({ created_at: -1 })
    .toArray()).map(stripMongoId);

  if (conversations.length === 0) {
    return [];
  }

  const conversationIds = conversations.map((conv: any) => conv.id);

  const [allMessages, allTags, allConvTags] = await Promise.all([
    db
      .collection('messages')
      .find({ conversation_id: { $in: conversationIds } })
      .sort({ sent_at: -1, created_at: -1 })
      .toArray()
      .then((docs: any[]) => docs.map(stripMongoId)),
    db.collection('tags').find({}).toArray().then((docs: any[]) => docs.map(stripMongoId)),
    db
      .collection('conversation_tags')
      .find({ conversation_id: { $in: conversationIds } })
      .toArray()
      .then((docs: any[]) => docs.map(stripMongoId)),
  ]);

  const enriched = conversations.map((conv: any) => {
    const messages = allMessages.filter((m: any) => m.conversation_id === conv.id);
    const sortedMessages = messages.sort((a: any, b: any) => {
      const dateA = new Date(a.sent_at || a.created_at || 0).getTime();
      const dateB = new Date(b.sent_at || b.created_at || 0).getTime();
      return dateB - dateA;
    });

    let lastMessagePreview = '';
    if (sortedMessages.length > 0) {
      const stored = parseStoredMessage(sortedMessages[0].content || '');
      const raw = stored.text || stored.html || '';
      lastMessagePreview = raw
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    const tagIds = allConvTags
      .filter((ct: any) => ct.conversation_id === conv.id)
      .map((ct: any) => ct.tag_id);
    const tags = allTags
      .filter((t: any) => tagIds.includes(t.id))
      .map((t: any) => t.name);

    return {
      ...conv,
      message_count: messages.length,
      last_message_at: sortedMessages.length > 0
        ? (sortedMessages[0].sent_at || sortedMessages[0].created_at)
        : (conv.updated_at || conv.created_at),
      last_message_preview: lastMessagePreview,
      tags: tags || [],
    };
  });

  enriched.sort((a: any, b: any) => {
    const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    if (dateB !== dateA) return dateB - dateA;
    const fallbackA = a.updated_at || a.created_at || 0;
    const fallbackB = b.updated_at || b.created_at || 0;
    return new Date(fallbackB).getTime() - new Date(fallbackA).getTime();
  });

  return enriched;
}

export async function getConversationMessagesData(
  conversationId: number,
  pagination: MessagePagination = {}
) {
  const db = await getMongoDbOrThrow();
  const conversationDoc = await db.collection('conversations').findOne({ id: conversationId });
  const conversation = conversationDoc ? stripMongoId(conversationDoc) : null;

  if (!conversation) {
    return {
      conversation: null,
      messages: [],
      hasMore: false,
      oldestMessageId: null,
    };
  }

  const limit = pagination.limit ?? 50;
  const offset = pagination.offset ?? 0;
  const beforeId = pagination.beforeId;

  const messageFilter: Record<string, unknown> = {
    conversation_id: conversationId,
  };
  if (beforeId) {
    messageFilter.id = { $lt: beforeId };
  }

  let cursor = db
    .collection('messages')
    .find(messageFilter)
    .sort({ sent_at: -1, created_at: -1, id: -1 });

  if (offset > 0 && !beforeId) {
    cursor = cursor.skip(offset);
  }

  const messages = (await cursor.limit(limit).toArray())
    .map(stripMongoId)
    .reverse();

  const parsedMessages = messages.map((msg: any) => {
    const stored = parseStoredMessage(msg.content || '');
    return {
      ...msg,
      content: stored.html ? undefined : stored.text,
      text: stored.text,
      html: stored.html,
      images: stored.images,
      attachments: stored.attachments,
    };
  });

  const hasMore = parsedMessages.length === limit;
  const oldestMessageId = parsedMessages.length > 0 ? parsedMessages[0].id : null;

  return {
    conversation,
    messages: parsedMessages,
    hasMore,
    oldestMessageId,
  };
}
