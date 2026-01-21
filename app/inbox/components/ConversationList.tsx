/**
 * Conversation list component
 */

'use client';

import { useRef } from 'react';
import type { Conversation } from '../types';
import { formatConversationTime } from '../utils';
import styles from '../page.module.css';

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversation: Conversation | null;
  searchQuery: string;
  onSelectConversation: (conversation: Conversation) => void;
  onSearchChange: (query: string) => void;
  leftWidth: number;
}

export function ConversationList({
  conversations,
  selectedConversation,
  searchQuery,
  onSelectConversation,
  onSearchChange,
  leftWidth,
}: ConversationListProps) {
  const conversationListRef = useRef<HTMLDivElement>(null);

  return (
    <div 
      className={styles.conversationList}
      style={{ width: `${leftWidth}px` }}
    >
      <div className={styles.searchContainer}>
        <input
          type="text"
          placeholder="Caută conversații..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={styles.searchInput}
        />
      </div>
      <div 
        ref={conversationListRef}
        className={styles.conversationListContent}
      >
        {conversations.length === 0 ? (
          <div className={styles.emptyConversations}>
            {searchQuery ? 'Nu s-au găsit conversații' : 'Nu există conversații'}
          </div>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={`${styles.conversationItem} ${
                selectedConversation?.id === conv.id ? styles.active : ''
              }`}
              onClick={() => onSelectConversation(conv)}
            >
              <div className={styles.conversationHeader}>
                <div className={styles.contactName}>{conv.contact_name || 'Fără nume'}</div>
                {conv.unread_count && conv.unread_count > 0 && (
                  <div className={styles.unreadBadge}>{conv.unread_count}</div>
                )}
              </div>
              <div className={styles.conversationMeta}>
                <span className={styles.channel}>{conv.channel}</span>
                {conv.last_message_at && (
                  <span className={styles.lastMessageTime}>
                    {formatConversationTime(conv.last_message_at)}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

