'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import DOMPurify from 'dompurify';
import styles from './page.module.css';

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
  subject: string;
  status: string;
  message_count: number;
  last_message_at: string;
  tags: string[];
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [suggestedResponse, setSuggestedResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
      fetchSuggestedResponse(selectedConversation.id);
    }
  }, [selectedConversation]);

  const fetchConversations = async () => {
    try {
      const response = await fetch('/api/conversations?userId=1');
      const result = await response.json();
      console.log('Conversations response:', result);
      if (result.conversations && Array.isArray(result.conversations)) {
        setConversations(result.conversations);
        if (result.conversations.length > 0 && !selectedConversation) {
          setSelectedConversation(result.conversations[0]);
        }
      } else {
        console.warn('No conversations in response:', result);
        setConversations([]);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId: number) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}`);
      const result = await response.json();
      setMessages(result.messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const fetchSuggestedResponse = async (conversationId: number) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/suggest-response?userId=1`);
      const result = await response.json();
      setSuggestedResponse(result.suggestedResponse);
    } catch (error) {
      console.error('Error fetching suggested response:', error);
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
        fetchMessages(selectedConversation.id);
        fetchConversations();
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const useSuggestedResponse = () => {
    if (suggestedResponse) {
      setNewMessage(suggestedResponse);
    }
  };

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

      <div className={styles.inbox}>
        <div className={styles.conversationList}>
          <h2 className={styles.sectionTitle}>Conversații</h2>
          {conversations.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666', fontSize: '0.875rem' }}>
              Nu există conversații
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
                <div className={styles.channel}>{conv.channel}</div>
              </div>
              {conv.subject && (
                <div className={styles.subject}>{conv.subject}</div>
              )}
              <div className={styles.tags}>
                {conv.tags?.map((tag, idx) => (
                  <span key={idx} className={styles.tag}>{tag}</span>
                ))}
              </div>
              <div className={styles.meta}>
                {conv.message_count || 0} mesaje • {conv.last_message_at ? (() => {
                  try {
                    const date = new Date(conv.last_message_at);
                    if (!isNaN(date.getTime())) {
                      return date.toLocaleDateString('ro-RO');
                    }
                  } catch (e) {}
                  return conv.last_message_at ? String(conv.last_message_at).split('T')[0] : 'N/A';
                })() : 'N/A'}
              </div>
            </div>
            ))
          )}
        </div>

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

              <div className={styles.messages}>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`${styles.message} ${
                      msg.direction === 'outbound' ? styles.outbound : styles.inbound
                    } ${msg.html ? styles.messageHtmlEmail : styles.messageTextOnly}`}
                  >
                    <div className={styles.messageContent}>
                      {msg.html ? (
                        <EmailHtmlContent html={msg.html} />
                      ) : (
                        <div className={styles.messageText}>{msg.content || msg.text}</div>
                      )}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className={styles.messageAttachments}>
                          {msg.attachments.map((att, idx) => (
                            <div key={idx} className={styles.messageAttachment}>
                              📎 {att.filename} ({Math.round(att.size / 1024)}KB)
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={styles.messageTime}>
                      {new Date(msg.sent_at).toLocaleString('ro-RO')}
                    </div>
                  </div>
                ))}
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
                  placeholder="Scrie un mesaj..."
                  rows={3}
                />
                <button onClick={sendMessage} className={styles.sendButton}>
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

