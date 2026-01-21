/**
 * Message list component with date separators
 */

'use client';

import type { Message, GroupedMessageItem } from '../types';
import { formatMessageTime, formatDateSeparator } from '../utils';
import { EmailHtmlContent } from './EmailHtmlContent';
import styles from '../page.module.css';

interface MessageListProps {
  groupedMessages: GroupedMessageItem[];
  loadingOlderMessages: boolean;
}

export function MessageList({ groupedMessages, loadingOlderMessages }: MessageListProps) {
  return (
    <>
      {loadingOlderMessages && (
        <div className={styles.loadingOlder}>
          Se încarcă mesaje mai vechi...
        </div>
      )}
      {groupedMessages.map((item, index) => {
        if (item.type === 'date' && item.date) {
          // Use date string as key to avoid duplicates
          const dateKey = item.date.toISOString().split('T')[0];
          const { formatDateSeparator } = require('../utils');
          return (
            <div key={`date-${dateKey}`} className={styles.dateSeparator}>
              {formatDateSeparator(item.date)}
            </div>
          );
        }
        
        if (item.type === 'message' && item.message) {
          return <MessageItem key={item.message.id} message={item.message} />;
        }
        
        return null;
      })}
    </>
  );
}

interface MessageItemProps {
  message: Message;
}

function MessageItem({ message }: MessageItemProps) {
  const isOutbound = message.direction === 'outbound';
  
  // Validate date before using it
  let msgDate: Date | null = null;
  if (message.sent_at) {
    const date = new Date(message.sent_at);
    if (!isNaN(date.getTime())) {
      msgDate = date;
    }
  }
  
  // Determine content to display
  // Priority: html (if valid and non-empty) > text > content
  const hasHtml = !!(message.html && message.html.trim().length > 0);
  const displayContent = hasHtml ? undefined : (message.text || message.content || '');
  
  return (
    <div key={message.id}>
      {hasHtml ? (
        <div className={styles.messageHtmlWrapper}>
          <EmailHtmlContent html={message.html!} />
          {msgDate && (
            <div className={styles.messageTimestamp} style={{ 
              textAlign: 'right', 
              padding: '0.25rem 1rem',
              fontSize: '0.6875rem',
              color: '#737373'
            }}>
              {formatMessageTime(msgDate)}
            </div>
          )}
        </div>
      ) : (
        <div className={`${styles.messageWrapper} ${isOutbound ? styles.outboundWrapper : styles.inboundWrapper}`}>
          <div className={`${styles.messageBubble} ${isOutbound ? styles.outboundBubble : styles.inboundBubble}`}>
            {displayContent && (
              <div className={styles.messageText}>{displayContent}</div>
            )}
            {message.attachments && message.attachments.length > 0 && (
              <div className={styles.messageAttachments}>
                {message.attachments.map((att, idx) => (
                  <div key={idx} className={styles.messageAttachment}>
                    📎 {att.filename} ({Math.round(att.size / 1024)}KB)
                  </div>
                ))}
              </div>
            )}
            {msgDate && (
              <div className={styles.messageTimestamp}>
                {formatMessageTime(msgDate)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

