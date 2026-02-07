import InboxPageClient from './InboxPageClient';
import { DEFAULT_USER_ID } from '@/lib/constants';
import { getConversationMessagesData, getConversationsData } from '@/lib/server/inbox';

export const revalidate = 30;

type InboxPageProps = {
  searchParams?: { conversation?: string };
};

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const conversations = await getConversationsData(DEFAULT_USER_ID, 'all');

  let selectedConversationId: number | null = null;
  if (searchParams?.conversation) {
    const parsed = Number(searchParams.conversation);
    if (!Number.isNaN(parsed)) {
      selectedConversationId = parsed;
    }
  }

  if (selectedConversationId !== null) {
    const match = conversations.find((c: any) => c.id === selectedConversationId);
    if (!match) {
      selectedConversationId = null;
    }
  }

  if (selectedConversationId === null && conversations.length > 0) {
    selectedConversationId = conversations[0].id;
  }

  let initialMessages: any[] | null = null;
  let initialHasMoreMessages = false;
  let initialOldestMessageId: number | null = null;

  if (selectedConversationId !== null) {
    const messageData = await getConversationMessagesData(selectedConversationId, { limit: 50 });
    initialMessages = messageData.messages;
    initialHasMoreMessages = messageData.hasMore;
    initialOldestMessageId = messageData.oldestMessageId;
  }

  return (
    <InboxPageClient
      initialConversations={conversations}
      initialSelectedConversationId={selectedConversationId}
      initialMessages={initialMessages}
      initialHasMoreMessages={initialHasMoreMessages}
      initialOldestMessageId={initialOldestMessageId}
    />
  );
}
