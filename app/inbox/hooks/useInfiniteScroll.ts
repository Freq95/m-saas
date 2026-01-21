/**
 * Custom hook for infinite scroll functionality
 */

import { useCallback, useRef, useEffect } from 'react';
import { INBOX_CONFIG } from '../constants';

interface UseInfiniteScrollProps {
  hasMore: boolean;
  loading: boolean;
  oldestMessageId: number | null;
  onLoadMore: (beforeId: number) => void;
  messagesContainerRef: React.RefObject<HTMLDivElement>;
}

export function useInfiniteScroll({
  hasMore,
  loading,
  oldestMessageId,
  onLoadMore,
  messagesContainerRef,
}: UseInfiniteScrollProps) {
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    
    // Load more if scrolled within threshold of top and there are more messages
    if (
      scrollTop < INBOX_CONFIG.SCROLL_THRESHOLD &&
      hasMore &&
      !loading &&
      oldestMessageId
    ) {
      // Prevent multiple simultaneous requests
      if (container.dataset.loadingOlder === 'true') return;
      container.dataset.loadingOlder = 'true';
      
      onLoadMore(oldestMessageId);
      
      // Reset flag after a delay to allow new requests
      setTimeout(() => {
        container.dataset.loadingOlder = 'false';
      }, 1000);
    }
  }, [hasMore, loading, oldestMessageId, onLoadMore]);

  // Note: Auto-scroll logic is handled in the main component
  // to have access to messages array for dependency tracking

  return { handleScroll };
}

