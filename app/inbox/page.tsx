import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import InboxPageClient from './InboxPageClient';
import { getAuthUser, redirectToLogin } from '@/lib/auth-helpers';
import { getConversationsData } from '@/lib/server/inbox';
import { getCached } from '@/lib/redis';
import { conversationsCacheKey } from '@/lib/cache-keys';
import { requireInboxAccess } from '@/lib/inbox-access';

export const revalidate = 0;

export default async function InboxPage() {
  let auth;
  try {
    auth = await getAuthUser();
  } catch (err) {
    redirectToLogin(err);
  }
  try {
    requireInboxAccess(auth);
  } catch {
    redirect('/calendar?inbox=blocked');
  }

  // 30-min cache safe because every write path that adds/changes a message
  // (manual Gmail/Yahoo sync, inbound webhook, in-app actions through
  // invalidateReadCaches) explicitly invalidates this key. The TTL is a safety
  // net only — typical user-visible staleness is zero.
  const initialConversations = await getCached(
    conversationsCacheKey({ tenantId: auth.tenantId, userId: auth.userId }),
    1800,
    () => getConversationsData({ userId: auth.userId, tenantId: auth.tenantId })
  ).catch(() => []);

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
