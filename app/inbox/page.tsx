import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import InboxPageClient from './InboxPageClient';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getConversationsData } from '@/lib/server/inbox';

export const revalidate = 0;

export default async function InboxPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }

  const initialConversations = await getConversationsData({
    userId: auth.userId,
    tenantId: auth.tenantId,
  }).catch(() => []);

  return (
    <Suspense fallback={null}>
      <InboxPageClient
        initialConversations={initialConversations as any}
        initialSelectedConversationId={null}
        initialMessages={null}
        initialHasMoreMessages={false}
        initialOldestMessageId={null}
      />
    </Suspense>
  );
}
