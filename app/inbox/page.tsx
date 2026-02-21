import InboxPageClient from './InboxPageClient';
import { redirect } from 'next/navigation';
import { getConversationMessagesData, getConversationsData } from '@/lib/server/inbox';
import { auth } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export const revalidate = 30;

type InboxPageProps = {
  searchParams?: { conversation?: string };
};

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const userId = Number.parseInt(session.user.id, 10);
  if (!Number.isFinite(userId) || userId <= 0) redirect('/login');
  if (!session.user.tenantId || !ObjectId.isValid(session.user.tenantId)) redirect('/login');
  const tenantId = new ObjectId(session.user.tenantId);

  const conversations = await getConversationsData(userId, tenantId);

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
    const messageData = await getConversationMessagesData(selectedConversationId, {
      userId,
      tenantId,
      limit: 50,
    });
    initialMessages = messageData.messages;
    initialHasMoreMessages = messageData.hasMore;
    initialOldestMessageId = messageData.oldestMessageId;
  }

  return (
    <InboxPageClient
      initialUserId={userId}
      initialConversations={conversations}
      initialSelectedConversationId={selectedConversationId}
      initialMessages={initialMessages}
      initialHasMoreMessages={initialHasMoreMessages}
      initialOldestMessageId={initialOldestMessageId}
    />
  );
}
