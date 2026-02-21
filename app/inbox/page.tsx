import { Suspense } from 'react';
import InboxPageClient from './InboxPageClient';

function InboxPageInner() {
  return (
    <InboxPageClient
      initialConversations={[]}
      initialSelectedConversationId={null}
      initialMessages={null}
      initialHasMoreMessages={false}
      initialOldestMessageId={null}
    />
  );
}

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <InboxPageInner />
    </Suspense>
  );
}
