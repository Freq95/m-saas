/**
 * Main inbox page component
 * Refactored for better code organization and maintainability
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import styles from './page.module.css';
import { useInboxData } from './hooks/useInboxData';
import { useSuggestedResponse } from './hooks/useSuggestedResponse';
import { useResizableDivider } from './hooks/useResizableDivider';
import { useInfiniteScroll } from './hooks/useInfiniteScroll';
import { useSearch } from './hooks/useSearch';
import { ConversationList } from './components/ConversationList';
import { MessageList } from './components/MessageList';
import { groupMessagesWithDateSeparators } from './utils';
import { INBOX_CONFIG } from './constants';

export default function InboxPage() {
  const [newMessage, setNewMessage] = useState('');
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Custom hooks
  const {
    conversations: allConversations,
    selectedConversation,
    setSelectedConversation,
    messages,
    allMessages,
    loading,
    loadingOlderMessages,
    hasMoreMessages,
    oldestMessageId,
    fetchMessages,
    sendMessage,
  } = useInboxData();

  const suggestedResponse = useSuggestedResponse(selectedConversation?.id || null);
  const { leftWidth, isResizing, setIsResizing, containerRef } = useResizableDivider();
  const { searchQuery, setSearchQuery, conversations } = useSearch(
    allConversations,
    allMessages
  );

  // Handle infinite scroll
  const { handleScroll } = useInfiniteScroll({
    hasMore: hasMoreMessages,
    loading: loadingOlderMessages,
    oldestMessageId,
    onLoadMore: (beforeId) => {
      if (selectedConversation) {
        fetchMessages(selectedConversation.id, false, beforeId);
      }
    },
    messagesContainerRef,
  });

  // Handle scroll position when loading older messages
  useEffect(() => {
    if (loadingOlderMessages && messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      const previousScrollHeight = container.scrollHeight;
      
      // Restore scroll position after DOM update
      const timeoutId = setTimeout(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          const scrollDiff = newScrollHeight - previousScrollHeight;
          container.scrollTop = container.scrollTop + scrollDiff;
        }
      }, 0);

      return () => clearTimeout(timeoutId);
    }
  }, [loadingOlderMessages, messages]);

  // Scroll to bottom after initial message load
  useEffect(() => {
    if (messages.length > 0 && messagesContainerRef.current) {
      const timeoutId = setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop =
            messagesContainerRef.current.scrollHeight;
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [selectedConversation?.id]); // Only when conversation changes

  const handleSendMessage = async () => {
    if (!selectedConversation || !newMessage.trim()) return;

    const messageToSend = newMessage.trim();
    setNewMessage(''); // Clear input immediately for better UX

    const success = await sendMessage(selectedConversation.id, messageToSend);
    if (!success) {
      // Restore message if send failed
      setNewMessage(messageToSend);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleUseSuggestedResponse = () => {
    if (suggestedResponse) {
      setNewMessage(suggestedResponse);
    }
  };

  // Group messages with date separators
  const groupedMessages = groupMessagesWithDateSeparators(messages);

  if (loading) {
    return <div className={styles.container}>Se încarcă...</div>;
  }

  return (
    <div className={styles.container}>
      <nav className={styles.nav}>
        <Link href="/">
          <h1 className={styles.logo}>OpsGenie</h1>
        </Link>
        <div className={styles.navLinks}>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/inbox" className={styles.active}>Inbox</Link>
          <Link href="/calendar">Calendar</Link>
          <Link href="/clients">Clienți</Link>
        </div>
      </nav>

      <div ref={containerRef} className={styles.inbox}>
        <ConversationList
          conversations={conversations}
          selectedConversation={selectedConversation}
          searchQuery={searchQuery}
          onSelectConversation={setSelectedConversation}
          onSearchChange={setSearchQuery}
          leftWidth={leftWidth}
        />

        <div
          className={`${styles.divider} ${isResizing ? styles.resizing : ''}`}
          onMouseDown={() => setIsResizing(true)}
        />

        <div className={styles.thread}>
          {selectedConversation ? (
            <>
              <div className={styles.threadHeader}>
                <div>
                  <h3>{selectedConversation.contact_name || 'Fără nume'}</h3>
                  <div className={styles.threadMeta}>
                    {selectedConversation.contact_email} • {selectedConversation.channel}
                  </div>
                </div>
                <div className={styles.status}>{selectedConversation.status}</div>
              </div>

              <div
                ref={messagesContainerRef}
                className={styles.messages}
                onScroll={handleScroll}
              >
                <MessageList
                  groupedMessages={groupedMessages}
                  loadingOlderMessages={loadingOlderMessages}
                />
              </div>

              {suggestedResponse && (
                <div className={styles.suggestedResponse}>
                  <div className={styles.suggestedHeader}>
                    <span>Răspuns sugerat de AI:</span>
                    <button onClick={handleUseSuggestedResponse} className={styles.useButton}>
                      Folosește
                    </button>
                  </div>
                  <div className={styles.suggestedText}>{suggestedResponse}</div>
                </div>
              )}

              <div className={styles.messageInput}>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Scrie un mesaj..."
                  rows={1}
                />
                <button
                  onClick={handleSendMessage}
                  className={styles.sendButton}
                  disabled={!newMessage.trim()}
                >
                  Trimite
                </button>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>Selectează o conversație</div>
          )}
        </div>
      </div>
    </div>
  );
}
