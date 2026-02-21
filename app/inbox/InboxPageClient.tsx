'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import createDOMPurify from 'dompurify';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import styles from './page.module.css';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';

/**
 * Email HTML content component using iframe for complete style isolation
 * This matches how Yahoo Mail and other major email clients render emails
 */
function EmailHtmlContent({ html }: { html: string }) {
  const [iframeHeight, setIframeHeight] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sanitizeConfig = {
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
  };

  // On server render, skip DOMPurify; sanitize safely in browser where window exists.
  const sanitized = useMemo(() => {
    if (typeof window === 'undefined') {
      return html;
    }
    const purifier = createDOMPurify(window);
    return purifier.sanitize(html, sanitizeConfig);
  }, [html]);

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
  client_id?: number | null;
  subject: string;
  message_count: number;
  last_message_at: string;
  last_message_preview?: string;
  tags: string[];
  has_unread?: boolean;
}

interface Message {
  id: number;
  direction: string;
  content: string;
  text?: string;
  html?: string;
  sent_at: string;
  images?: Array<{
    url?: string;
    cid?: string;
    data?: string;
    contentType: string;
    last_saved_client_id?: number;
    last_saved_client_file_id?: number;
    last_saved_at?: string;
    saved_client_ids?: number[];
  }>;
  attachments?: Array<{
    id?: number;
    filename: string;
    contentType: string;
    size: number;
    persisted?: boolean;
    last_saved_client_id?: number;
    last_saved_client_file_id?: number;
    last_saved_at?: string;
    saved_client_ids?: number[];
  }>;
}

interface ClientOption {
  id: number;
  name: string;
  email?: string | null;
}

interface SaveableItem {
  key: string;
  type: 'attachment' | 'image';
  messageId: number;
  imageIndex?: number;
  attachmentId?: number;
  label: string;
  savable: boolean;
  savedClientId?: number;
  savedAt?: string;
  savedClientIds?: number[];
}

interface InboxPageClientProps {
  initialConversations: Conversation[];
  initialSelectedConversationId: number | null;
  initialMessages: Message[] | null;
  initialHasMoreMessages?: boolean;
  initialOldestMessageId?: number | null;
}

export default function InboxPageClient({
  initialConversations,
  initialSelectedConversationId,
  initialMessages,
  initialHasMoreMessages = false,
  initialOldestMessageId = null,
}: InboxPageClientProps) {
  const toast = useToast();
  const { data: session, status: sessionStatus } = useSession();
  const sessionUserId =
    session?.user?.id && /^[1-9]\d*$/.test(session.user.id)
      ? Number.parseInt(session.user.id, 10)
      : null;
  const searchParams = useSearchParams();
  const conversationParam = searchParams.get('conversation');

  const initialSelectedConversation = useMemo(() => {
    if (initialSelectedConversationId !== null) {
      return initialConversations.find((c) => c.id === initialSelectedConversationId) || null;
    }
    return initialConversations[0] || null;
  }, [initialConversations, initialSelectedConversationId]);

  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [allConversations, setAllConversations] = useState<Conversation[]>(initialConversations);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(initialSelectedConversation);
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? []);
  const [newMessage, setNewMessage] = useState('');
  const [suggestedResponse, setSuggestedResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialConversations.length === 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [leftWidth, setLeftWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(initialHasMoreMessages);
  const [oldestMessageId, setOldestMessageId] = useState<number | null>(initialOldestMessageId);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [knownClientNames, setKnownClientNames] = useState<Record<number, string>>({});
  const [hasActivatedClientSearch, setHasActivatedClientSearch] = useState(false);
  const [loadingClientOptions, setLoadingClientOptions] = useState(false);
  const [selectedTargetClientId, setSelectedTargetClientId] = useState<number | null>(null);
  const [selectedSaveItemKeys, setSelectedSaveItemKeys] = useState<string[]>([]);
  const [savingItemKey, setSavingItemKey] = useState<string | null>(null);
  const [isSavingSelection, setIsSavingSelection] = useState(false);
  const [updatingReadState, setUpdatingReadState] = useState(false);
  const clientSearchRequestSeqRef = useRef(0);
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialMessagesRef = useRef<Message[] | null>(initialMessages);
  const initialMessagesConversationIdRef = useRef<number | null>(initialSelectedConversation?.id ?? initialSelectedConversationId);

  useEffect(() => {
    // Disabled auto-load to allow manual Yahoo sync testing.
    const AUTO_LOAD_CONVERSATIONS = true;
    if (AUTO_LOAD_CONVERSATIONS) {
      if (initialConversations.length > 0) {
        setLoading(false);
        return;
      }
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
      handleSelectConversation(match);
    }
  }, [conversationParam, allConversations, selectedConversation]);

  useEffect(() => {
    if (!selectedConversation) return;

    const hasInitialMessages =
      initialMessagesRef.current !== null &&
      initialMessagesConversationIdRef.current === selectedConversation.id;

    if (hasInitialMessages) {
      setMessages(initialMessagesRef.current || []);
      setHasMoreMessages(initialHasMoreMessages);
      setOldestMessageId(initialOldestMessageId ?? null);
      setSuggestedResponse(null);
      initialMessagesRef.current = null;
      initialMessagesConversationIdRef.current = null;
      return;
    }

    // Reset messages when switching conversations
    setMessages([]);
    setHasMoreMessages(false);
    setOldestMessageId(null);
    setSuggestedResponse(null);
    fetchMessages(selectedConversation.id, true);
  }, [selectedConversation, initialHasMoreMessages, initialOldestMessageId]);

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
      const response = await fetch('/api/conversations', {
        cache: 'no-store',
      });
      const result = await response.json();
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

  // Handle infinite scroll - load older messages when scrolling near bottom
  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const remainingToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    
    // Load more if scrolled within 200px of bottom and there are more messages
    if (remainingToBottom < 200 && hasMoreMessages && !loadingOlderMessages && oldestMessageId && selectedConversation) {
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

  const syncInbox = async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch('/api/yahoo/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todayOnly: true }),
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

  const applyUnreadStateLocally = (conversationId: number, hasUnread: boolean) => {
    const patchConversation = (conv: Conversation) =>
      conv.id === conversationId ? { ...conv, has_unread: hasUnread } : conv;

    setAllConversations((prev) => prev.map(patchConversation));
    setConversations((prev) => prev.map(patchConversation));
    setSelectedConversation((prev) =>
      prev && prev.id === conversationId ? { ...prev, has_unread: hasUnread } : prev
    );
  };

  const updateConversationReadState = async (
    conversationId: number,
    read: boolean,
    options?: { silent?: boolean }
  ) => {
    try {
      if (!options?.silent) {
        setUpdatingReadState(true);
      }
      const response = await fetch(`/api/conversations/${conversationId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update read state');
      }
      applyUnreadStateLocally(conversationId, Boolean(result.hasUnread));
    } catch (error) {
      console.error('Failed to update read state:', error);
      if (!options?.silent) {
        toast.error(error instanceof Error ? error.message : 'Failed to update read state');
      }
    } finally {
      if (!options?.silent) {
        setUpdatingReadState(false);
      }
    }
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    if (conversation.has_unread) {
      updateConversationReadState(conversation.id, true, { silent: true });
    }
  };

  const buildSelectedClientOption = useCallback((): ClientOption[] => {
    if (!selectedTargetClientId || selectedTargetClientId <= 0) {
      return [];
    }
    const knownName = knownClientNames[selectedTargetClientId];
    const fallbackName = knownName || `Client #${selectedTargetClientId}`;
    return [{
      id: selectedTargetClientId,
      name: fallbackName,
      email: null,
    }];
  }, [selectedTargetClientId, knownClientNames]);

  const getPatientNameById = useCallback(
    (clientId: number) => {
      if (knownClientNames[clientId]) {
        return knownClientNames[clientId];
      }
      const option = clientOptions.find((entry) => entry.id === clientId);
      if (option?.name) {
        return option.name;
      }
      return `#${clientId}`;
    },
    [knownClientNames, clientOptions]
  );

  const loadClientOptions = useCallback(
    async (query: string) => {
      if (!sessionUserId && sessionStatus !== 'loading') {
        setLoadingClientOptions(false);
        setClientOptions(buildSelectedClientOption());
        return;
      }
      const requestSeq = ++clientSearchRequestSeqRef.current;
      if (!query.trim()) {
        setLoadingClientOptions(false);
        setClientOptions(buildSelectedClientOption());
        return;
      }
      setLoadingClientOptions(true);
      try {
        const trimmed = query.trim();
        const searchParams = new URLSearchParams({
          limit: '30',
          page: '1',
          sortBy: 'name',
          sortOrder: 'ASC',
        });
        if (sessionUserId) {
          searchParams.set('userId', sessionUserId.toString());
        }
        if (trimmed) {
          searchParams.set('search', trimmed);
        }

        const response = await fetch(`/api/clients?${searchParams.toString()}`, { cache: 'no-store' });
        const result = await response.json();
        const list = Array.isArray(result.clients) ? result.clients : [];
        const normalized: ClientOption[] = list
          .filter((client: any) => typeof client?.id === 'number')
          .map((client: any) => ({
            id: client.id,
            name: client.name || `Client #${client.id}`,
            email: client.email || null,
          }));

        if (requestSeq !== clientSearchRequestSeqRef.current) {
          return;
        }

        setKnownClientNames((prev) => {
          const next = { ...prev };
          for (const client of normalized) {
            next[client.id] = client.name;
          }
          return next;
        });

        setClientOptions(() => {
          const byId = new Map<number, ClientOption>();
          for (const client of normalized) {
            byId.set(client.id, client);
          }

          for (const selectedOption of buildSelectedClientOption()) {
            if (!byId.has(selectedOption.id)) {
              byId.set(selectedOption.id, selectedOption);
            }
          }

          return Array.from(byId.values());
        });
      } catch (error) {
        console.error('Failed to load clients:', error);
      } finally {
        if (requestSeq === clientSearchRequestSeqRef.current) {
          setLoadingClientOptions(false);
        }
      }
    },
    [buildSelectedClientOption, sessionStatus, sessionUserId]
  );

  useEffect(() => {
    if (!saveModalOpen) return;
    if (!hasActivatedClientSearch) return;
    const timeout = setTimeout(() => {
      loadClientOptions(clientSearch);
    }, 250);
    return () => clearTimeout(timeout);
  }, [saveModalOpen, hasActivatedClientSearch, clientSearch, loadClientOptions]);

  const saveableItems = useMemo<SaveableItem[]>(() => {
    const items: SaveableItem[] = [];
    for (const message of messages) {
      for (const [index, attachment] of (message.attachments || []).entries()) {
        const filename = attachment.filename || `Attachment #${index + 1}`;
        items.push({
          key: `attachment:${message.id}:${attachment.id ?? index}`,
          type: 'attachment',
          messageId: message.id,
          attachmentId: attachment.id,
          label: `${filename} (${Math.round((attachment.size || 0) / 1024)}KB)`,
          savable: Boolean(attachment.id && attachment.persisted),
          savedClientId: attachment.last_saved_client_id,
          savedAt: attachment.last_saved_at,
          savedClientIds: Array.isArray(attachment.saved_client_ids)
            ? attachment.saved_client_ids
            : undefined,
        });
      }

      for (const [index, image] of (message.images || []).entries()) {
        const canSave = Boolean(image.data || (image.url && image.url.startsWith('data:')));
        items.push({
          key: `image:${message.id}:${index}`,
          type: 'image',
          messageId: message.id,
          imageIndex: index,
          label: `Inline image #${index + 1}`,
          savable: canSave,
          savedClientId: image.last_saved_client_id,
          savedAt: image.last_saved_at,
          savedClientIds: Array.isArray(image.saved_client_ids)
            ? image.saved_client_ids
            : undefined,
        });
      }
    }
    return items;
  }, [messages]);

  useEffect(() => {
    if (!saveModalOpen) return;
    const savedClientIds = Array.from(new Set(
      saveableItems.flatMap((item) => {
        const ids: number[] = [];
        if (typeof item.savedClientId === 'number' && item.savedClientId > 0) {
          ids.push(item.savedClientId);
        }
        if (Array.isArray(item.savedClientIds)) {
          ids.push(...item.savedClientIds.filter((id): id is number => typeof id === 'number' && id > 0));
        }
        return ids;
      })
    ));

    const unresolved = savedClientIds.filter(
      (clientId) => !knownClientNames[clientId] && !clientOptions.some((entry) => entry.id === clientId)
    );
    if (unresolved.length === 0) {
      return;
    }

    let cancelled = false;
    const loadMissingNames = async () => {
      const loaded: ClientOption[] = [];
      for (const clientId of unresolved) {
        try {
          const response = await fetch(`/api/clients/${clientId}`, { cache: 'no-store' });
          const result = await response.json();
          const client = result?.client;
          if (client?.id && client?.name) {
            loaded.push({
              id: client.id,
              name: client.name,
              email: client.email || null,
            });
          }
        } catch (error) {
          console.error('Failed to resolve patient name:', error);
        }
      }

      if (cancelled || loaded.length === 0) {
        return;
      }

      setKnownClientNames((prev) => {
        const next = { ...prev };
        for (const client of loaded) {
          next[client.id] = client.name;
        }
        return next;
      });
    };

    loadMissingNames();
    return () => {
      cancelled = true;
    };
  }, [saveModalOpen, saveableItems, knownClientNames, clientOptions]);

  const isItemAlreadySavedForClient = useCallback(
    (item: SaveableItem, clientId: number | null) => {
      if (!clientId) {
        return false;
      }
      if (Array.isArray(item.savedClientIds) && item.savedClientIds.includes(clientId)) {
        return true;
      }
      return Boolean(item.savedClientId && item.savedClientId === clientId);
    },
    []
  );

  const openSaveModal = async () => {
    if (!selectedConversation) return;
    setSaveModalOpen(true);
    setClientSearch('');
    setHasActivatedClientSearch(false);

    const defaultClientId =
      typeof selectedConversation.client_id === 'number' && selectedConversation.client_id > 0
        ? selectedConversation.client_id
        : null;
    setSelectedTargetClientId(defaultClientId);

    const defaultKeys = saveableItems
      .filter((item) => item.savable && !isItemAlreadySavedForClient(item, defaultClientId))
      .map((item) => item.key);
    setSelectedSaveItemKeys(defaultKeys);

    setClientOptions([]);
    if (defaultClientId) {
      try {
        const response = await fetch(`/api/clients/${defaultClientId}`, { cache: 'no-store' });
        const result = await response.json();
        const client = result?.client;
        if (client?.id) {
          setClientOptions([{
            id: client.id,
            name: client.name || `Client #${client.id}`,
            email: client.email || null,
          }]);
          setKnownClientNames((prev) => ({
            ...prev,
            [client.id]: client.name || `Client #${client.id}`,
          }));
        }
      } catch (error) {
        console.error('Failed to load linked client:', error);
      }
    }
  };

  const handleToggleSaveItem = (itemKey: string) => {
    setSelectedSaveItemKeys((prev) => (
      prev.includes(itemKey) ? prev.filter((key) => key !== itemKey) : [...prev, itemKey]
    ));
  };

  useEffect(() => {
    setSelectedSaveItemKeys((prev) =>
      prev.filter((itemKey) => {
        const item = saveableItems.find((entry) => entry.key === itemKey);
        if (!item) {
          return false;
        }
        return !isItemAlreadySavedForClient(item, selectedTargetClientId);
      })
    );
  }, [selectedTargetClientId, saveableItems, isItemAlreadySavedForClient]);

  const resolveSavePayload = () => {
    if (selectedTargetClientId && selectedTargetClientId > 0) {
      return { clientId: selectedTargetClientId };
    }
    return { createClient: true };
  };

  const saveSingleItem = async (item: SaveableItem) => {
    if (!selectedConversation) return;
    if (!item.savable) return;

    const payload = resolveSavePayload();

    if (item.type === 'attachment') {
      if (!item.attachmentId) {
        throw new Error('Attachment ID invalid');
      }
      const response = await fetch(
        `/api/conversations/${selectedConversation.id}/attachments/${item.attachmentId}/save`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save attachment');
      }
      if (typeof result.clientId === 'number') {
        setSelectedTargetClientId(result.clientId);
      }
      return;
    }

    const response = await fetch(`/api/conversations/${selectedConversation.id}/images/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        messageId: item.messageId,
        imageIndex: item.imageIndex,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'Failed to save inline image');
    }
    if (typeof result.clientId === 'number') {
      setSelectedTargetClientId(result.clientId);
    }
  };

  const saveSelectedItems = async () => {
    const selectedItems = saveableItems.filter(
      (item) =>
        item.savable &&
        selectedSaveItemKeys.includes(item.key) &&
        !isItemAlreadySavedForClient(item, selectedTargetClientId)
    );
    if (!selectedConversation || selectedItems.length === 0) {
      return;
    }

    setIsSavingSelection(true);
    try {
      for (const item of selectedItems) {
        setSavingItemKey(item.key);
        await saveSingleItem(item);
      }
      await fetchMessages(selectedConversation.id, true);
      await fetchConversations();
      toast.success('Elementele selectate au fost salvate in fisa pacientului.');
    } catch (error) {
      console.error('Save selection failed:', error);
      toast.error(error instanceof Error ? error.message : 'Eroare la salvare');
    } finally {
      setSavingItemKey(null);
      setIsSavingSelection(false);
    }
  };

  const formatSaveStatus = (item: SaveableItem) => {
    if (!item.savable) {
      return 'Nu poate fi salvat (lipsesc datele sursa)';
    }
    if (isItemAlreadySavedForClient(item, selectedTargetClientId)) {
      const selectedPatientName = selectedTargetClientId
        ? getPatientNameById(selectedTargetClientId)
        : 'pacientul selectat';
      return `Deja salvat pentru pacientul selectat (${selectedPatientName})`;
    }
    if (Array.isArray(item.savedClientIds) && item.savedClientIds.length > 1) {
      return `Salvat la ${item.savedClientIds.length} pacienti`;
    }
    if (item.savedClientId) {
      const patientName = getPatientNameById(item.savedClientId);
      if (item.savedAt) {
        const date = new Date(item.savedAt);
        if (!Number.isNaN(date.getTime())) {
          return `Salvat la pacient ${patientName} (${format(date, 'dd.MM.yyyy HH:mm')})`;
        }
      }
      return `Salvat la pacient ${patientName}`;
    }
    return 'Nesalvat';
  };

  const getSaveIconClassName = (item: SaveableItem) => {
    if (!item.savable) {
      return styles.saveStateDisabled;
    }
    if (isItemAlreadySavedForClient(item, selectedTargetClientId)) {
      return styles.saveStateSaved;
    }
    return styles.saveStateUnsaved;
  };

  const renderAttachments = (
    attachments?: Array<{
      id?: number;
      filename: string;
      contentType: string;
      size: number;
      persisted?: boolean;
      last_saved_client_id?: number;
      last_saved_at?: string;
      saved_client_ids?: number[];
    }>
  ) => {
    if (!attachments || attachments.length === 0) {
      return null;
    }

    return (
      <div className={styles.messageAttachments}>
        {attachments.map((att, idx) => (
          <div key={`${att.id || att.filename}-${idx}`} className={styles.messageAttachment}>
            <div className={styles.attachmentMeta}>
              Attachment: {att.filename} ({Math.round((att.size || 0) / 1024)}KB)
            </div>
            <div className={styles.attachmentStatus}>
              {Array.isArray(att.saved_client_ids) && att.saved_client_ids.length > 1
                ? `Salvat la ${att.saved_client_ids.length} pacienti`
                : att.last_saved_client_id
                ? `Salvat la pacient ${getPatientNameById(att.last_saved_client_id)}`
                : att.persisted
                  ? 'Nesalvat'
                  : 'Nedisponibil'}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderInlineImages = (
    images?: Array<{
      url?: string;
      cid?: string;
      data?: string;
      contentType: string;
      last_saved_client_id?: number;
      saved_client_ids?: number[];
    }>
  ) => {
    if (!images || images.length === 0) {
      return null;
    }

    return (
      <div className={styles.messageAttachments}>
        {images.map((image, idx) => {
          const canSave = Boolean(image.data || (image.url && image.url.startsWith('data:')));
          return (
            <div key={`${idx}:${image.cid || 'inline'}`} className={styles.messageAttachment}>
              <div className={styles.attachmentMeta}>Inline image #{idx + 1}</div>
              <div className={styles.attachmentStatus}>
                {Array.isArray(image.saved_client_ids) && image.saved_client_ids.length > 1
                  ? `Salvata la ${image.saved_client_ids.length} pacienti`
                  : image.last_saved_client_id
                  ? `Salvata la pacient ${getPatientNameById(image.last_saved_client_id)}`
                  : canSave
                    ? 'Nesalvata'
                    : 'Nedisponibila'}
              </div>
            </div>
          );
        })}
      </div>
    );
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

    [...messages].reverse().forEach((msg) => {
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
    return (
      <div className={styles.container}>
        <div className={styles.inbox}>
          <div className={styles.conversationList} style={{ width: '380px' }}>
            <div className={styles.searchContainer}>
              <div className="skeleton skeleton-line" style={{ height: '38px', width: '100%', marginBottom: '0.5rem' }} />
              <div className="skeleton skeleton-line" style={{ height: '36px', width: '100%' }} />
            </div>
            <div className={styles.conversationListContent} style={{ padding: '0.4rem' }}>
              <div className="skeleton-stack">
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div key={idx} className="skeleton skeleton-card" style={{ height: '72px' }} />
                ))}
              </div>
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.thread}>
            <div className={styles.threadHeader}>
              <div className="skeleton-stack" style={{ width: '280px' }}>
                <div className="skeleton skeleton-line" style={{ height: '16px', width: '58%' }} />
                <div className="skeleton skeleton-line" style={{ height: '12px', width: '86%' }} />
              </div>
            </div>

            <div className={styles.messages} style={{ padding: '0.8rem' }}>
              <div className="skeleton-stack">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="skeleton skeleton-card"
                    style={{ height: idx % 2 === 0 ? '56px' : '92px', width: idx % 2 === 0 ? '64%' : '84%' }}
                  />
                ))}
              </div>
            </div>

            <div className={styles.messageInput}>
              <div className="skeleton skeleton-line" style={{ height: '42px', width: '100%' }} />
              <div className="skeleton skeleton-line" style={{ height: '42px', width: '110px' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>

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
          <div className={styles.conversationListContent}>
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
                onClick={() => handleSelectConversation(conv)}
              >
                <div className={styles.conversationHeader}>
                  <div className={styles.contactName}>{conv.contact_name || 'Fără nume'}</div>
                  {conv.has_unread && (
                    <div className={styles.unreadBadge} aria-label="Unread conversation" />
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
                {conv.last_message_preview && (
                  <div className={styles.lastMessagePreview}>
                    {conv.last_message_preview}
                  </div>
                )}
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
                <div className={styles.threadHeaderActions}>
                  <button
                    type="button"
                    className={styles.readToggleButton}
                    onClick={openSaveModal}
                    disabled={saveableItems.length === 0}
                  >
                    Salveaza Documentele
                  </button>
                  <button
                    type="button"
                    className={styles.readToggleButton}
                    onClick={() =>
                      updateConversationReadState(
                        selectedConversation.id,
                        selectedConversation.has_unread === true
                      )
                    }
                    disabled={updatingReadState}
                  >
                    {selectedConversation.has_unread
                      ? 'Mark as read'
                      : 'Mark as unread'}
                  </button>
                </div>
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
                      <div key={msg.id} className={styles.messageItem}>
                        {msg.html ? (
                          <div className={styles.messageHtmlWrapper}>
                            {renderAttachments(msg.attachments)}
                            {renderInlineImages(msg.images)}
                            <EmailHtmlContent html={msg.html} />
                          </div>
                        ) : (
                          <div className={`${styles.messageWrapper} ${isOutbound ? styles.outboundWrapper : styles.inboundWrapper}`}>
                            <div className={`${styles.messageBubble} ${isOutbound ? styles.outboundBubble : styles.inboundBubble}`}>
                              <div className={styles.messageText}>{msg.content || msg.text}</div>
                              {renderAttachments(msg.attachments)}
                              {renderInlineImages(msg.images)}
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

      {saveModalOpen && (
        <div className={styles.saveModalBackdrop} onClick={() => setSaveModalOpen(false)}>
          <div className={styles.saveModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.saveModalHeader}>
              <h4>Salveaza atasamente si poze</h4>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={() => setSaveModalOpen(false)}
              >
                Inchide
              </button>
            </div>

            <div className={styles.saveModalSection}>
              <div className={styles.saveModalLabel}>Client propus / destinatie</div>
              <input
                type="text"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                onFocus={() => setHasActivatedClientSearch(true)}
                className={styles.searchInput}
                placeholder="Cauta client dupa nume, email sau telefon..."
              />
              <div className={styles.clientList}>
                {clientOptions.map((client) => (
                  <label key={client.id} className={styles.clientOption}>
                    <input
                      type="radio"
                      name="save-target-client"
                      checked={selectedTargetClientId === client.id}
                      onChange={() => setSelectedTargetClientId(client.id)}
                    />
                    <span>
                      {client.name} {client.email ? `(${client.email})` : ''}
                    </span>
                  </label>
                ))}
                {!loadingClientOptions && hasActivatedClientSearch && clientSearch.trim().length > 0 && clientOptions.length === 0 && (
                  <div className={styles.modalHint}>Nu am gasit clienti pentru cautarea curenta.</div>
                )}
                {!selectedTargetClientId && (
                  <div className={styles.modalHint}>
                    Daca nu alegi client, sistemul va crea automat unul nou la prima salvare.
                  </div>
                )}
              </div>
            </div>

            <div className={styles.saveModalSection}>
              <div className={styles.saveModalLabel}>Elemente detectate in conversatie</div>
              <div className={styles.saveItemList}>
                {saveableItems.length === 0 && (
                  <div className={styles.modalHint}>Nu exista atasamente sau poze inline de salvat.</div>
                )}
                {saveableItems.map((item) => (
                  <label key={item.key} className={styles.saveItemRow}>
                    <input
                      type="checkbox"
                      checked={selectedSaveItemKeys.includes(item.key)}
                      disabled={
                        !item.savable ||
                        isSavingSelection ||
                        isItemAlreadySavedForClient(item, selectedTargetClientId)
                      }
                      onChange={() => handleToggleSaveItem(item.key)}
                    />
                    <div className={styles.saveItemMeta}>
                      <div>{item.type === 'attachment' ? 'Attachment' : 'Poza'}: {item.label}</div>
                      <div className={styles.saveItemStatus}>
                        {savingItemKey === item.key ? (
                          'Se salveaza...'
                        ) : (
                          <span
                            className={styles.saveStateIcon}
                            title={formatSaveStatus(item)}
                            aria-label={formatSaveStatus(item)}
                          >
                            <svg
                              className={getSaveIconClassName(item)}
                              viewBox="0 0 24 24"
                              width="15"
                              height="15"
                              aria-hidden="true"
                            >
                              <path
                                fill="currentColor"
                                d="M5 3h11l3 3v15H5V3zm2 2v4h8V5H7zm0 8v6h10v-6H7zm2 1h6v4H9v-4z"
                              />
                            </svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.saveModalActions}>
              <button
                type="button"
                className={styles.readToggleButton}
                onClick={() => setSaveModalOpen(false)}
                disabled={isSavingSelection}
              >
                Anuleaza
              </button>
              <button
                type="button"
                className={styles.attachmentSaveButton}
                onClick={saveSelectedItems}
                disabled={isSavingSelection || selectedSaveItemKeys.length === 0}
              >
                {isSavingSelection ? 'Se salveaza...' : 'Salveaza selectate'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}

