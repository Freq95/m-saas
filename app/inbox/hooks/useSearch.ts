/**
 * Custom hook for conversation search functionality
 */

import { useState, useEffect, useMemo } from 'react';
import type { Conversation, MessagesByConversation } from '../types';
import { parseMessageContentForSearch } from '../utils';

export function useSearch(
  allConversations: Conversation[],
  allMessages: MessagesByConversation
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>(allConversations);

  // Update conversations when allConversations changes
  useEffect(() => {
    setConversations(allConversations);
  }, [allConversations]);

  // Filter conversations based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setConversations(allConversations);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = allConversations.filter((conv) => {
      // Search in contact name, email, phone, subject
      if (
        conv.contact_name?.toLowerCase().includes(query) ||
        conv.contact_email?.toLowerCase().includes(query) ||
        conv.contact_phone?.toLowerCase().includes(query) ||
        conv.subject?.toLowerCase().includes(query)
      ) {
        return true;
      }

      // Search in message content (only if messages are loaded)
      const convMessages = allMessages[conv.id] || [];
      if (convMessages.length > 0) {
        return convMessages.some((msg) => {
          const textContent = parseMessageContentForSearch(msg);
          return textContent.toLowerCase().includes(query);
        });
      }
      return false;
    });

    setConversations(filtered);
  }, [searchQuery, allConversations, allMessages]);

  return {
    searchQuery,
    setSearchQuery,
    conversations,
  };
}

