/**
 * Custom hook for inbox data fetching and management
 */

import { useState, useEffect, useCallback } from 'react';
import type { Conversation, Message, MessagesByConversation } from '../types';
import { API_ENDPOINTS, INBOX_CONFIG } from '../constants';

export function useInboxData() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [allMessages, setAllMessages] = useState<MessagesByConversation>({});
  const [loading, setLoading] = useState(true);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [oldestMessageId, setOldestMessageId] = useState<number | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch(`${API_ENDPOINTS.CONVERSATIONS}?userId=1&todayOnly=true`);
      const result = await response.json();
      
      if (result.conversations && Array.isArray(result.conversations)) {
        setAllConversations(result.conversations);
        setConversations(result.conversations);
        
        // Fetch messages for all conversations for search (only if not already loaded)
        // Use Promise.allSettled to avoid blocking and handle errors gracefully
        const messagePromises = result.conversations
          .filter((conv: Conversation) => !allMessages[conv.id])
          .map(async (conv: Conversation) => {
            try {
              const msgResponse = await fetch(`${API_ENDPOINTS.CONVERSATION_MESSAGES(conv.id)}?limit=${INBOX_CONFIG.SEARCH_MESSAGES_LIMIT}`);
              const msgResult = await msgResponse.json();
              if (msgResult.messages) {
                return { convId: conv.id, messages: msgResult.messages };
              }
            } catch (e) {
              // Silently fail for background refresh
            }
            return null;
          });
        
        const messageResults = await Promise.allSettled(messagePromises);
        messageResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            setAllMessages((prev) => ({
              ...prev,
              [result.value!.convId]: result.value!.messages,
            }));
          }
        });
        
        // Only auto-select first conversation if none is selected
        if (result.conversations.length > 0 && !selectedConversation) {
          setSelectedConversation(result.conversations[0]);
        }
      } else {
        setAllConversations([]);
        setConversations([]);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
      setAllConversations([]);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [allMessages, selectedConversation]);

  const fetchMessages = useCallback(async (
    conversationId: number,
    isInitial = false,
    beforeId?: number
  ) => {
    try {
      if (isInitial) {
        setLoadingOlderMessages(false);
      } else {
        setLoadingOlderMessages(true);
      }

      const url = new URL(API_ENDPOINTS.CONVERSATION_MESSAGES(conversationId), window.location.origin);
      url.searchParams.set('limit', INBOX_CONFIG.MESSAGES_PER_PAGE.toString());
      if (beforeId) {
        url.searchParams.set('beforeId', beforeId.toString());
      }

      const response = await fetch(url.toString());
      const result = await response.json();
      const fetchedMessages = result.messages || [];
      
      if (isInitial) {
        setMessages(fetchedMessages);
      } else {
        // Prepend older messages
        setMessages((prev) => [...fetchedMessages, ...prev]);
      }
      
      setHasMoreMessages(result.hasMore || false);
      setOldestMessageId(result.oldestMessageId || null);
      
      // Store in allMessages for search (merge with existing)
      setAllMessages((prev) => ({
        ...prev,
        [conversationId]: isInitial 
          ? fetchedMessages 
          : [...fetchedMessages, ...(prev[conversationId] || [])],
      }));
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingOlderMessages(false);
    }
  }, []);

  const sendMessage = useCallback(async (
    conversationId: number,
    content: string
  ): Promise<boolean> => {
    try {
      const response = await fetch(API_ENDPOINTS.SEND_MESSAGE(conversationId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, direction: 'outbound' }),
      });

      if (response.ok) {
        // Reload messages and conversations
        await fetchMessages(conversationId, true);
        await fetchConversations();
        return true;
      } else {
        console.error('Failed to send message:', await response.text());
        return false;
      }
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }, [fetchMessages, fetchConversations]);

  // Auto-refresh conversations
  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;
    
    const fetchAndRefresh = async () => {
      if (!isMounted) return;
      await fetchConversations();
    };
    
    // Initial fetch
    fetchAndRefresh();
    
    // Auto-refresh conversations every 30 seconds to pick up new emails
    intervalId = setInterval(() => {
      if (isMounted) {
        fetchAndRefresh();
      }
    }, INBOX_CONFIG.AUTO_REFRESH_INTERVAL);
    
    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchConversations]);

  // Reset messages when switching conversations
  useEffect(() => {
    if (selectedConversation) {
      setMessages([]);
      setHasMoreMessages(false);
      setOldestMessageId(null);
      fetchMessages(selectedConversation.id, true);
    }
  }, [selectedConversation, fetchMessages]);

  return {
    conversations,
    allConversations,
    setConversations,
    selectedConversation,
    setSelectedConversation,
    messages,
    allMessages,
    loading,
    loadingOlderMessages,
    hasMoreMessages,
    oldestMessageId,
    fetchConversations,
    fetchMessages,
    sendMessage,
  };
}

