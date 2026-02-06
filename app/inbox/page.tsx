'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import DOMPurify from 'dompurify';
import { format, isSameDay, isToday, isYesterday, startOfDay } from 'date-fns';
import styles from './page.module.css';
import { DEFAULT_USER_ID } from '@/lib/constants';

/**
 * Email HTML content component using iframe for complete style isolation
 * This matches how Yahoo Mail and other major email clients render emails
 */
function EmailHtmlContent({ html }: { html: string }) {
  const [iframeHeight, setIframeHeight] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sanitize HTML with permissive config for emails
  const sanitized = DOMPurify.sanitize(html, {
    WHOLE_DOCUMENT: true, // Preserve html/head/body structure
    ADD_TAGS: ['style', 'meta', 'link'], // Allow style tags and meta tags
    ADD_ATTR: [
      'target', 'rel', 'name', 'content', 'http-equiv', 'charset',
      'bgcolor', 'color', 'align', 'valign', 'border', 'cellpadding', 'cellspacing',
      'colspan', 'rowspan', 'media', 'type'
    ],
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 'b', 'i', 'a', 'ul', 'ol', 'li',
      'img', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'table', 'tr', 'td', 'th', 'tbody', 'thead', 'tfoot', 'blockquote',
      'hr', 'pre', 'code', 'center', 'font', 'style', 'head', 'body', 'html',
      'meta', 'link', 'button', 'form', 'input', 'select', 'textarea'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'style', 'width', 'height',
      'bgcolor', 'color', 'align', 'valign', 'border', 'cellpadding', 'cellspacing',
      'colspan', 'rowspan', 'target', 'rel', 'id', 'name', 'type', 'value',
      'action', 'method', 'role', 'aria-label'
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ALLOW_DATA_ATTR: true,
    KEEP_CONTENT: true,
  });

  // Extract body content from sanitized HTML
  let bodyContent = sanitized;
  
  // If HTML contains full document structure, extract just the body
  const bodyMatch = sanitized.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    bodyContent = bodyMatch[1];
  } else {
    // Remove html/head tags if present
    bodyContent = sanitized
      .replace(/^<html[^>]*>/i, '')
      .replace(/<\/html>$/i, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/^<body[^>]*>|<\/body>$/gi, '');
  }

  // Wrap in full HTML document for iframe
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #ffffff;
      color: #000000;
      line-height: 1.6;
    }
    img {
      max-width: 100%;
      height: auto;
      display: block;
    }
    table {
      max-width: 100%;
      border-collapse: collapse;
    }
    a {
      color: #0066cc;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;

  // Auto-resize iframe based on content
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc && doc.body) {
          const height = Math.max(
            doc.body.scrollHeight,
            doc.body.offsetHeight,
            doc.documentElement?.clientHeight || 0,
            doc.documentElement?.scrollHeight || 0
          );
          setIframeHeight(height);
        }
      } catch (e) {
        // Cross-origin or other error, use default height
        console.warn('Could not access iframe content for auto-resize:', e);
        setIframeHeight(600); // Default height
      }
    };

    iframe.addEventListener('load', handleLoad);
    // Also try after a short delay in case content loads asynchronously
    const timeout = setTimeout(handleLoad, 500);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      clearTimeout(timeout);
    };
  }, [html]);

  return (
    <div className={styles.emailContainer}>
      <iframe
        ref={iframeRef}
        title="Email Content"
        srcDoc={fullHtml}
        style={{
          width: '100%',
          maxWidth: '100%',
          border: 'none',
          height: iframeHeight ? `${iframeHeight}px` : '600px',
          minHeight: '200px',
          backgroundColor: '#ffffff',
          colorScheme: 'light', // Force light mode for email content
          display: 'block',
        }}
        sandbox="allow-same-origin allow-scripts"
        className={styles.emailIframe}
      />
    </div>
  );
}

interface Conversation {
  id: number;
  channel: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  subject: string;
  status: string;
  message_count: number;
  last_message_at: string;
  tags: string[];
  unread_count?: number;
}

interface Message {
  id: number;
  direction: string;
  content: string;
  text?: string;
  html?: string;
  sent_at: string;
  images?: Array<{ url?: string; cid?: string; data?: string; contentType: string }>;
  attachments?: Array<{ filename: string; contentType: string; size: number }>;
}

export default function InboxPage() {
  const searchParams = useSearchParams();
  const conversationParam = searchParams.get('conversation');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [suggestedResponse, setSuggestedResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [leftWidth, setLeftWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [oldestMessageId, setOldestMessageId] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const conversationListRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Disabled auto-load to allow manual Yahoo sync testing.
    const AUTO_LOAD_CONVERSATIONS = false;
    if (AUTO_LOAD_CONVERSATIONS) {
      fetchConversations();
      return;
    }
    setLoading(false);
    setAllConversations([]);
    setConversations([]);
    setSelectedConversation(null);
  }, []);

  useEffect(() => {
    if (!conversationParam || allConversations.length === 0 || selectedConversation) return;
    const id = parseInt(conversationParam, 10);
    if (Number.isNaN(id)) return;
    const match = allConversations.find((c) => c.id === id);
    if (match) {
      setSelectedConversation(match);
    }
  }, [conversationParam, allConversations, selectedConversation]);

  useEffect(() => {
    if (selectedConversation) {
      // Reset messages when switching conversations
      setMessages([]);
      setHasMoreMessages(false);
      setOldestMessageId(null);
      fetchMessages(selectedConversation.id, true);
      fetchSuggestedResponse(selectedConversation.id);
    }
  }, [selectedConversation]);

  // Filter conversations based on search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setConversations(allConversations);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = allConversations.filter((conv) => {
      return (
        conv.contact_name?.toLowerCase().includes(query) ||
        conv.contact_email?.toLowerCase().includes(query) ||
        conv.contact_phone?.toLowerCase().includes(query) ||
        conv.subject?.toLowerCase().includes(query)
      );
    });

    setConversations(filtered);
  }, [searchQuery, allConversations]);

  const fetchConversations = async () => {
    try {
      const response = await fetch(`/api/conversations?userId=${DEFAULT_USER_ID}`, {
        cache: 'no-store',
      });
      const result = await response.json();
      console.log('Conversations response:', result);
      if (result.conversations && Array.isArray(result.conversations)) {
        setAllConversations(result.conversations);
        setConversations(result.conversations);

        if (result.conversations.length > 0) {
          const paramId = conversationParam ? parseInt(conversationParam, 10) : null;
          const paramMatch = paramId
            ? result.conversations.find((c: Conversation) => c.id === paramId)
            : null;

          if (paramMatch) {
            setSelectedConversation(paramMatch);
          } else if (selectedConversation) {
            const updatedSelected = result.conversations.find((c: Conversation) => c.id === selectedConversation.id);
            const fallback = result.conversations[0];
            if (updatedSelected) {
              // If current selection has no messages but a newer conversation does, switch to top
              if ((updatedSelected.message_count || 0) === 0 && (fallback?.message_count || 0) > 0) {
                setSelectedConversation(fallback);
              } else {
                setSelectedConversation(updatedSelected);
              }
            } else {
              setSelectedConversation(fallback);
            }
          } else {
            setSelectedConversation(result.conversations[0]);
          }
        }
      } else {
        console.warn('No conversations in response:', result);
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
  };

  const fetchMessages = async (conversationId: number, isInitial = false, beforeId?: number) => {
    try {
      if (isInitial) {
        setLoadingOlderMessages(false);
      } else {
        setLoadingOlderMessages(true);
      }

      const url = new URL(`/api/conversations/${conversationId}`, window.location.origin);
      url.searchParams.set('limit', '50');
      if (beforeId) {
        url.searchParams.set('beforeId', beforeId.toString());
      }

      const response = await fetch(url.toString(), { cache: 'no-store' });
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
      
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  // Handle infinite scroll - load older messages when scrolling near top
  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;
    
    // Load more if scrolled within 200px of top and there are more messages
    if (scrollTop < 200 && hasMoreMessages && !loadingOlderMessages && oldestMessageId && selectedConversation) {
      fetchMessages(selectedConversation.id, false, oldestMessageId);
    }
  }, [hasMoreMessages, loadingOlderMessages, oldestMessageId, selectedConversation]);

  // Handle resizable divider
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth = e.clientX - containerRect.left;
      
      // Constrain within min/max bounds
      const maxLeftWidth = containerRect.width - 300; // min right width
      const constrainedWidth = Math.max(200, Math.min(newLeftWidth, maxLeftWidth));
      
      setLeftWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const fetchSuggestedResponse = async (conversationId: number) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/suggest-response?userId=${DEFAULT_USER_ID}`, {
        cache: 'no-store',
      });
      const result = await response.json();
      setSuggestedResponse(result.suggestedResponse);
    } catch (error) {
      console.error('Error fetching suggested response:', error);
    }
  };

  const syncInbox = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch('/api/yahoo/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: DEFAULT_USER_ID, todayOnly: true }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || err.message || 'Failed to sync inbox');
      }
      await fetchConversations();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync inbox';
      setSyncError(message);
      console.error('Inbox sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedConversation || !newMessage.trim()) return;

    try {
      const response = await fetch(`/api/conversations/${selectedConversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newMessage, direction: 'outbound' }),
      });

      if (response.ok) {
        setNewMessage('');
        // Reload messages to show the new one (fetch latest messages)
        fetchMessages(selectedConversation.id, true);
        fetchConversations();
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const useSuggestedResponse = () => {
    if (suggestedResponse) {
      setNewMessage(suggestedResponse);
    }
  };

  // Format date for message timestamp
  const formatMessageTime = (date: Date | null) => {
    // Validate date before using it
    if (!date || isNaN(date.getTime())) {
      return '';
    }
    
    try {
      return format(date, 'HH:mm');
    } catch (error) {
      console.warn('Error formatting message time:', error);
      return '';
    }
  };

  // Format date for date separator
  const formatDateSeparator = (date: Date) => {
    // Validate date before using it
    if (!date || isNaN(date.getTime())) {
      return '';
    }
    
    try {
      if (isToday(date)) {
        return 'Astăzi';
      } else if (isYesterday(date)) {
        return 'Ieri';
      } else {
        return format(date, 'd MMMM yyyy');
      }
    } catch (error) {
      console.warn('Error formatting date:', error);
      return '';
    }
  };

  // Group messages and add date separators
  const groupedMessages = useMemo(() => {
    if (!messages || messages.length === 0) return [];

    const grouped: Array<{ type: 'date' | 'message'; date?: Date; message?: Message }> = [];
    let lastDate: Date | null = null;

    messages.forEach((msg, index) => {
      if (!msg.sent_at) return; // Skip messages without sent_at
      
      const msgDate = new Date(msg.sent_at);
      
      // Skip if date is invalid
      if (isNaN(msgDate.getTime())) return;

      // Add date separator if this is a new day
      if (!lastDate || !isSameDay(msgDate, lastDate)) {
        grouped.push({ type: 'date', date: msgDate });
        lastDate = msgDate;
      }

      // Add message
      grouped.push({ type: 'message', message: msg });
    });

    return grouped;
  }, [messages]);

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
          <Link href="/settings/email">Setări</Link>
        </div>
      </nav>

      <div ref={containerRef} className={styles.inbox}>
        <div 
          className={styles.conversationList}
          style={{ width: `${leftWidth}px` }}
        >
          <div className={styles.searchContainer}>
            <input
              type="text"
              placeholder="Caută conversații..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            <button
              type="button"
              className={styles.syncButton}
              onClick={syncInbox}
              disabled={syncing}
            >
              {syncing ? 'Sincronizare...' : 'Sincronizează Inbox'}
            </button>
            {syncError && (
              <div className={styles.syncError}>{syncError}</div>
            )}
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
                onClick={() => setSelectedConversation(conv)}
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
                      {(() => {
                        try {
                          const date = new Date(conv.last_message_at);
                          if (!isNaN(date.getTime())) {
                            if (isToday(date)) {
                              return format(date, 'HH:mm');
                            } else if (isYesterday(date)) {
                              return 'Ieri';
                            } else {
                              return format(date, 'dd.MM');
                            }
                          }
                        } catch (e) {}
                        return '';
                      })()}
                    </span>
                  )}
                </div>
              </div>
              ))
            )}
          </div>
        </div>

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
                onScroll={handleMessagesScroll}
              >
                {loadingOlderMessages && (
                  <div className={styles.loadingOlder}>
                    Se încarcă mesaje mai vechi...
                  </div>
                )}
                {groupedMessages.map((item, index) => {
                  if (item.type === 'date' && item.date) {
                    return (
                      <div key={`date-${index}`} className={styles.dateSeparator}>
                        {formatDateSeparator(item.date)}
                      </div>
                    );
                  }
                  
                  if (item.type === 'message' && item.message) {
                    const msg = item.message;
                    const isOutbound = msg.direction === 'outbound';
                    
                    // Validate date before using it
                    let msgDate: Date | null = null;
                    if (msg.sent_at) {
                      const date = new Date(msg.sent_at);
                      if (!isNaN(date.getTime())) {
                        msgDate = date;
                      }
                    }
                    
                    return (
                      <div key={msg.id}>
                        {msg.html ? (
                          <div className={styles.messageHtmlWrapper}>
                            <EmailHtmlContent html={msg.html} />
                          </div>
                        ) : (
                          <div className={`${styles.messageWrapper} ${isOutbound ? styles.outboundWrapper : styles.inboundWrapper}`}>
                            <div className={`${styles.messageBubble} ${isOutbound ? styles.outboundBubble : styles.inboundBubble}`}>
                              <div className={styles.messageText}>{msg.content || msg.text}</div>
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div className={styles.messageAttachments}>
                                  {msg.attachments.map((att, idx) => (
                                    <div key={idx} className={styles.messageAttachment}>
                                      📎 {att.filename} ({Math.round(att.size / 1024)}KB)
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className={styles.messageTimestamp}>
                                {formatMessageTime(msgDate)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>

              {suggestedResponse && (
                <div className={styles.suggestedResponse}>
                  <div className={styles.suggestedHeader}>
                    <span>Răspuns sugerat de AI:</span>
                    <button onClick={useSuggestedResponse} className={styles.useButton}>
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
                <button onClick={sendMessage} className={styles.sendButton} disabled={!newMessage.trim()}>
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

