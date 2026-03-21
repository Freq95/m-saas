import { getMongoDbOrThrow, stripMongoId } from '@/lib/db/mongo-utils';
import { parseStoredMessage } from '@/lib/email-types';
import { ObjectId } from 'mongodb';

type MessagePagination = {
  userId?: number;
  tenantId?: ObjectId;
  limit?: number;
  offset?: number;
  beforeId?: number;
};

type ConversationsQuery = {
  userId: number;
  tenantId?: ObjectId;
  search?: string;
};

export async function getConversationsData(query: ConversationsQuery) {
  const db = await getMongoDbOrThrow();
  const userId = query.userId;
  const tenantId = query.tenantId;
  const search = query.search?.trim();

  const conversationFilter: Record<string, unknown> = { user_id: userId };
  if (tenantId) {
    conversationFilter.tenant_id = tenantId;
  }
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    conversationFilter.$or = [
      { contact_name: regex },
      { contact_email: regex },
      { contact_phone: regex },
      { subject: regex },
    ];
  }

  const conversationsQuery = db
    .collection('conversations')
    .find(conversationFilter)
    .project({
      _id: 1,
      id: 1,
      tenant_id: 1,
      user_id: 1,
      channel: 1,
      channel_id: 1,
      contact_name: 1,
      contact_email: 1,
      contact_phone: 1,
      subject: 1,
      client_id: 1,
      created_at: 1,
      updated_at: 1,
    })
    .sort({ created_at: -1 });

  const conversations = (await conversationsQuery.toArray()).map(stripMongoId);

  if (conversations.length === 0) {
    return [];
  }

  const conversationIds = conversations.map((conv: any) => conv.id);
  const messagesMatch = tenantId
    ? { tenant_id: tenantId, conversation_id: { $in: conversationIds } }
    : { conversation_id: { $in: conversationIds } };

  // Stats pipeline: project only small scalar fields before $sort to stay under MongoDB's
  // 32 MB in-memory sort limit. Content (potentially large email bodies) is excluded here
  // and fetched separately below for a bounded set of top conversations.
  const messageStatsPipeline: Record<string, unknown>[] = [
    { $match: messagesMatch },
    {
      $project: {
        conversation_id: 1,
        direction: 1,
        is_read: 1,
        source_uid: 1,
        external_id: 1,
        id: 1,
        sent_at: 1,
        created_at: 1,
      },
    },
    { $addFields: { event_at: { $ifNull: ['$sent_at', '$created_at'] } } },
    { $sort: { conversation_id: 1, event_at: -1, id: -1 } },
    {
      $group: {
        _id: '$conversation_id',
        message_count: { $sum: 1 },
        unread_count: {
          $sum: {
            $cond: [
              { $and: [{ $eq: ['$direction', 'inbound'] }, { $eq: ['$is_read', false] }] },
              1,
              0,
            ],
          },
        },
        last_message_at: { $first: '$event_at' },
        has_yahoo_messages: {
          $max: {
            $cond: [
              {
                $and: [
                  { $eq: ['$direction', 'inbound'] },
                  { $ne: [{ $ifNull: ['$source_uid', null] }, null] },
                ],
              },
              1,
              0,
            ],
          },
        },
        has_gmail_messages: {
          $max: {
            $cond: [
              {
                $and: [
                  { $eq: ['$direction', 'inbound'] },
                  { $eq: [{ $ifNull: ['$source_uid', null] }, null] },
                  { $ne: [{ $ifNull: ['$external_id', null] }, null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ];

  const [messageStats, allConvTags, attachmentRows] = await Promise.all([
    db.collection('messages').aggregate(messageStatsPipeline).toArray(),
    db
      .collection('conversation_tags')
      .find(tenantId ? { conversation_id: { $in: conversationIds }, tenant_id: tenantId } : { conversation_id: { $in: conversationIds } })
      .project({ conversation_id: 1, tag_id: 1 })
      .toArray()
      .then((docs: any[]) => docs.map(stripMongoId)),
    db.collection('message_attachments').aggregate([
      { $match: messagesMatch },
      { $group: { _id: '$conversation_id', count: { $sum: 1 } } },
    ]).toArray(),
  ]);

  const attachmentsByConversation = new Map<number, number>();
  for (const row of attachmentRows as any[]) {
    if (typeof row?._id === 'number') {
      attachmentsByConversation.set(row._id, typeof row.count === 'number' ? row.count : 0);
    }
  }

  const messageStatsByConversation = new Map<number, any>();
  for (const stat of messageStats as any[]) {
    messageStatsByConversation.set(stat._id, stat);
  }

  const tagIds = Array.from(
    new Set(
      allConvTags
        .map((ct: any) => ct.tag_id)
        .filter((tagId: unknown): tagId is number => typeof tagId === 'number')
    )
  );

  let tagsById = new Map<number, string>();
  if (tagIds.length > 0) {
    const tags = await db.collection('tags')
      .find(tenantId ? { tenant_id: tenantId, id: { $in: tagIds } } : { id: { $in: tagIds } })
      .project({ id: 1, name: 1 })
      .toArray();
    tagsById = new Map<number, string>(
      tags
        .map((tag: any) => stripMongoId(tag))
        .filter((tag: any) => typeof tag.id === 'number' && typeof tag.name === 'string')
        .map((tag: any) => [tag.id, tag.name])
    );
  }

  const tagNamesByConversation = new Map<number, string[]>();
  for (const ct of allConvTags as any[]) {
    const convId = ct.conversation_id;
    const tagName = tagsById.get(ct.tag_id);
    if (typeof convId !== 'number' || !tagName) {
      continue;
    }
    const names = tagNamesByConversation.get(convId) || [];
    names.push(tagName);
    tagNamesByConversation.set(convId, names);
  }

  const enriched = conversations.map((conv: any) => {
    const stats = messageStatsByConversation.get(conv.id);
    const hasYahooMessages = stats?.has_yahoo_messages === 1;
    const hasGmailMessages = stats?.has_gmail_messages === 1;
    const emailProvider =
      conv.channel === 'email'
        ? hasYahooMessages
          ? 'yahoo'
          : hasGmailMessages
            ? 'gmail'
            : null
        : null;

    return {
      ...conv,
      message_count: typeof stats?.message_count === 'number' ? stats.message_count : 0,
      has_unread: (typeof stats?.unread_count === 'number' ? stats.unread_count : 0) > 0,
      has_attachments: (attachmentsByConversation.get(conv.id) || 0) > 0,
      last_message_at: stats?.last_message_at || conv.updated_at || conv.created_at,
      last_message_preview: '',
      email_provider: emailProvider,
      tags: tagNamesByConversation.get(conv.id) || [],
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

  // Fetch last-message preview for the top 50 visible conversations only.
  // Content is excluded from the stats sort above to stay under MongoDB's 32 MB limit.
  const previewConversationIds = enriched
    .slice(0, 50)
    .map((conv: any) => conv.id)
    .filter((id: unknown): id is number => typeof id === 'number');
  if (previewConversationIds.length > 0) {
    const previewMatch = tenantId
      ? { tenant_id: tenantId, conversation_id: { $in: previewConversationIds } }
      : { conversation_id: { $in: previewConversationIds } };
    const previewRows = await db.collection('messages').aggregate([
      { $match: previewMatch },
      { $project: { conversation_id: 1, content: 1, created_at: 1, id: 1 } },
      { $sort: { conversation_id: 1, created_at: -1, id: -1 } },
      { $group: { _id: '$conversation_id', last_content: { $first: '$content' } } },
    ]).toArray();

    const previewByConversation = new Map<number, string>();
    for (const row of previewRows as any[]) {
      const convId = row?._id;
      if (typeof convId !== 'number' || typeof row?.last_content !== 'string') continue;
      const stored = parseStoredMessage(row.last_content);
      const raw = stored.text || stored.html || '';
      const preview = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      previewByConversation.set(convId, preview);
      if (Array.isArray(stored.attachments) && stored.attachments.length > 0) {
        const existing = attachmentsByConversation.get(convId) || 0;
        attachmentsByConversation.set(convId, Math.max(existing, stored.attachments.length));
      }
    }

    for (const conv of enriched as any[]) {
      if (previewByConversation.has(conv.id)) {
        conv.last_message_preview = previewByConversation.get(conv.id) || '';
      }
      if ((attachmentsByConversation.get(conv.id) || 0) > 0) {
        conv.has_attachments = true;
      }
    }
  }

  return enriched;
}

export async function getConversationMessagesData(
  conversationId: number,
  pagination: MessagePagination = {}
) {
  const db = await getMongoDbOrThrow();
  const conversationFilter: Record<string, unknown> = { id: conversationId };
  if (typeof pagination.userId === 'number') {
    conversationFilter.user_id = pagination.userId;
  }
  if (pagination.tenantId) {
    conversationFilter.tenant_id = pagination.tenantId;
  }
  const conversationDoc = await db.collection('conversations').findOne(conversationFilter);
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
  if (pagination.tenantId) {
    messageFilter.tenant_id = pagination.tenantId;
  }
  if (beforeId) {
    messageFilter.id = { $lt: beforeId };
  }

  let cursor = db
    .collection('messages')
    .find(messageFilter)
    .project({
      _id: 1,
      id: 1,
      conversation_id: 1,
      tenant_id: 1,
      direction: 1,
      content: 1,
      is_read: 1,
      sent_at: 1,
      created_at: 1,
      updated_at: 1,
    })
    .sort({ created_at: -1, id: -1 });

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

  const attachmentIds = parsedMessages.flatMap((msg: any) =>
    Array.isArray(msg.attachments)
      ? msg.attachments
          .map((attachment: any) => (typeof attachment?.id === 'number' ? attachment.id : null))
          .filter((id: number | null): id is number => id !== null)
      : []
  );

  if (attachmentIds.length > 0) {
    const [attachmentDocs, attachmentClientFiles] = await Promise.all([
      db
        .collection('message_attachments')
        .find({
          conversation_id: conversationId,
          tenant_id: pagination.tenantId,
          id: { $in: attachmentIds },
        })
        .toArray(),
      db
        .collection('client_files')
        .find({
          source_type: 'conversation_attachment',
          tenant_id: pagination.tenantId,
          source_conversation_id: conversationId,
          source_attachment_id: { $in: attachmentIds },
        })
        .toArray(),
    ]);

    const attachmentMap = new Map<number, any>(
      attachmentDocs
        .map((doc: any) => stripMongoId(doc))
        .map((doc: any) => [doc.id, doc])
    );

    const savedClientsByAttachmentId = new Map<number, Map<number, number>>();
    for (const fileDoc of attachmentClientFiles as any[]) {
      if (
        typeof fileDoc?.source_attachment_id !== 'number' ||
        typeof fileDoc?.client_id !== 'number' ||
        typeof fileDoc?.id !== 'number'
      ) {
        continue;
      }
      const savedClients = savedClientsByAttachmentId.get(fileDoc.source_attachment_id) || new Map<number, number>();
      savedClients.set(fileDoc.client_id, fileDoc.id);
      savedClientsByAttachmentId.set(fileDoc.source_attachment_id, savedClients);
    }

    for (const msg of parsedMessages as any[]) {
      if (!Array.isArray(msg.attachments)) {
        continue;
      }
      msg.attachments = msg.attachments.map((attachment: any) => {
        if (typeof attachment?.id !== 'number') {
          return attachment;
        }
        const persistedAttachment = attachmentMap.get(attachment.id);
        if (!persistedAttachment) {
          return attachment;
        }
        const savedClientsMap = savedClientsByAttachmentId.get(attachment.id) || new Map<number, number>();
        return {
          ...attachment,
          last_saved_client_id: persistedAttachment.last_saved_client_id,
          last_saved_client_file_id: persistedAttachment.last_saved_client_file_id,
          last_saved_at: persistedAttachment.last_saved_at,
          saved_client_ids: Array.from(savedClientsMap.entries()).map(([clientId, fileId]) => ({
            clientId,
            fileId,
          })),
        };
      });
    }
  }

  const imageRefs = parsedMessages.flatMap((msg: any) =>
    Array.isArray(msg.images)
      ? msg.images.map((_: any, idx: number) => ({ messageId: msg.id, imageIndex: idx }))
      : []
  );

  if (imageRefs.length > 0) {
    const messageIds = Array.from(
      new Set(
        imageRefs
          .map((ref: { messageId: number; imageIndex: number }) => ref.messageId)
          .filter((id: number): id is number => typeof id === 'number' && id > 0)
      )
    );

    const inlineImageClientFiles = await db
      .collection('client_files')
      .find({
        source_type: 'conversation_inline_image',
        tenant_id: pagination.tenantId,
        source_conversation_id: conversationId,
        source_message_id: { $in: messageIds },
      })
      .toArray();

    const savedClientsByImageRef = new Map<string, Map<number, number>>();
    for (const fileDoc of inlineImageClientFiles as any[]) {
      if (
        typeof fileDoc?.source_message_id !== 'number' ||
        typeof fileDoc?.source_image_index !== 'number' ||
        typeof fileDoc?.client_id !== 'number' ||
        typeof fileDoc?.id !== 'number'
      ) {
        continue;
      }
      const imageKey = `${fileDoc.source_message_id}:${fileDoc.source_image_index}`;
      const savedClients = savedClientsByImageRef.get(imageKey) || new Map<number, number>();
      savedClients.set(fileDoc.client_id, fileDoc.id);
      savedClientsByImageRef.set(imageKey, savedClients);
    }

    for (const msg of parsedMessages as any[]) {
      if (!Array.isArray(msg.images)) {
        continue;
      }
      msg.images = msg.images.map((image: any, idx: number) => {
        const imageKey = `${msg.id}:${idx}`;
        const savedClientsMap = savedClientsByImageRef.get(imageKey) || new Map<number, number>();
        return {
          ...image,
          saved_client_ids: Array.from(savedClientsMap.entries()).map(([clientId, fileId]) => ({
            clientId,
            fileId,
          })),
        };
      });
    }
  }

  const hasMore = parsedMessages.length === limit;
  const oldestMessageId = parsedMessages.length > 0 ? parsedMessages[0].id : null;

  return {
    conversation,
    messages: parsedMessages,
    hasMore,
    oldestMessageId,
  };
}
