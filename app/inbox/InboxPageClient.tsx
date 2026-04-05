'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import createDOMPurify from 'dompurify';
import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import styles from './page.module.css';
import { useToast } from '@/lib/useToast';
import { useIsMobile } from '@/lib/useIsMobile';
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
      'meta', 'link'
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'class', 'style', 'width', 'height',
      'bgcolor', 'color', 'align', 'valign', 'border', 'cellpadding', 'cellspacing',
      'colspan', 'rowspan', 'target', 'rel', 'id', 'name', 'type', 'value',
      'role', 'aria-label'
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
    @font-face {
      font-family: 'Chillax';
      src: url('/fonts/chillax/Chillax-Light.woff2') format('woff2');
      font-weight: 300;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Chillax';
      src: url('/fonts/chillax/Chillax-Regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Chillax';
      src: url('/fonts/chillax/Chillax-Medium.woff2') format('woff2');
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Chillax';
      src: url('/fonts/chillax/Chillax-Semibold.woff2') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Chillax';
      src: url('/fonts/chillax/Chillax-Bold.woff2') format('woff2');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }

    * {
      box-sizing: border-box;
    }
    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
    }
    body {
      font-family: 'Chillax', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
    }
    img {
      max-width: 100% !important;
      height: auto;
      display: block;
    }
    table {
      border-collapse: collapse;
    }
    pre, code {
      white-space: pre-wrap !important;
      word-break: break-word;
    }
    iframe, video {
      max-width: 100% !important;
      height: auto;
    }
    a {
      color: #0066cc;
      text-decoration: underline;
      word-break: break-word;
      overflow-wrap: anywhere;
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
    let animationFrameId = 0;
    let pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

    const fitIframeToViewport = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc || !doc.body || !doc.documentElement) return;

        const body = doc.body;
        const root = doc.documentElement;

        // Reset previously applied scaling before measuring natural size.
        body.style.transform = '';
        body.style.transformOrigin = '';
        body.style.width = '';
        body.style.margin = '0';

        const viewportWidth = iframe.clientWidth || iframe.getBoundingClientRect().width || 1;
        const naturalWidth = Math.max(
          body.scrollWidth,
          body.offsetWidth,
          root.scrollWidth,
          root.offsetWidth
        );

        let scale = 1;
        if (naturalWidth > viewportWidth + 1) {
          scale = viewportWidth / naturalWidth;
          body.style.width = `${naturalWidth}px`;
          body.style.transformOrigin = 'top left';
          body.style.transform = `scale(${scale})`;
        } else {
          body.style.width = '100%';
        }

        const naturalHeight = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          root.scrollHeight,
          root.offsetHeight
        );
        setIframeHeight(Math.ceil(naturalHeight * scale));
      } catch (e) {
        // Cross-origin or other error, use default height
        console.warn('Could not access iframe content for mobile-fit resize:', e);
        setIframeHeight(600); // Default height
      }
    };

    const scheduleFit = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = requestAnimationFrame(fitIframeToViewport);
    };

    const handleLoad = () => {
      scheduleFit();
      // Re-run after assets (images/fonts) settle.
      pendingTimeouts = [120, 360, 900, 1500].map((delay) => setTimeout(scheduleFit, delay));
    };

    iframe.addEventListener('load', handleLoad);
    const onWindowResize = () => scheduleFit();
    window.addEventListener('resize', onWindowResize);
    scheduleFit();

    return () => {
      iframe.removeEventListener('load', handleLoad);
      window.removeEventListener('resize', onWindowResize);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      pendingTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
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
  email_provider?: 'yahoo' | 'gmail' | null;
  has_attachments?: boolean;
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
    saved_client_ids?: Array<{ clientId: number; fileId: number }>;
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
    saved_client_ids?: Array<{ clientId: number; fileId: number }>;
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
  savedClients: Array<{ clientId: number; fileId: number }>;
  savedAt?: string;
}

type SyncLogLevel = 'info' | 'success' | 'warning' | 'error';

interface SyncLogEntry {
  id: string;
  at: string;
  level: SyncLogLevel;
  message: string;
}

interface ProviderSyncPayload {
  synced?: number;
  skipped?: number;
  errors?: number;
  attachmentFailures?: number;
  attachmentMissingContent?: number;
  attachmentUploadFailures?: number;
  error?: string;
  message?: string;
  reason?: string;
}

interface InboxPageClientProps {
  initialConversations: Conversation[];
  initialSelectedConversationId: number | null;
  initialMessages: Message[] | null;
  initialHasMoreMessages?: boolean;
  initialOldestMessageId?: number | null;
}

function getChannelLabel(channel: string, emailProvider?: 'yahoo' | 'gmail' | null): string {
  if (channel !== 'email') {
    return channel;
  }
  if (emailProvider === 'yahoo') {
    return 'Yahoo';
  }
  if (emailProvider === 'gmail') {
    return 'Gmail';
  }
  return 'Email';
}

function getChannelClassName(
  stylesMap: Record<string, string>,
  channel: string,
  emailProvider?: 'yahoo' | 'gmail' | null
): string {
  if (channel !== 'email') {
    return `${stylesMap.channel} ${stylesMap.channelDefault}`;
  }
  if (emailProvider === 'yahoo') {
    return `${stylesMap.channel} ${stylesMap.channelYahoo}`;
  }
  if (emailProvider === 'gmail') {
    return `${stylesMap.channel} ${stylesMap.channelGmail}`;
  }
  return `${stylesMap.channel} ${stylesMap.channelEmail}`;
}

export default function InboxPageClient({
  initialConversations,
  initialSelectedConversationId,
  initialMessages,
  initialHasMoreMessages = false,
  initialOldestMessageId = null,
}: InboxPageClientProps) {
  const toast = useToast();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const sessionUserId =
    session?.user?.id && /^[1-9]\d*$/.test(session.user.id)
      ? Number.parseInt(session.user.id, 10)
      : null;
  const searchParams = useSearchParams();
  const conversationParam = searchParams.get('conversation');
  const isMobile = useIsMobile();

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
  const [syncPartiallyFailed, setSyncPartiallyFailed] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [attachmentsOnly, setAttachmentsOnly] = useState(false);
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
  const [removingClientChipKeys, setRemovingClientChipKeys] = useState<string[]>([]);
  const [saveModalLoading, setSaveModalLoading] = useState(false);
  const [updatingReadState, setUpdatingReadState] = useState(false);
  const clientSearchRequestSeqRef = useRef(0);
  const inboxSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastApiErrorToastRef = useRef<{ key: string; at: number } | null>(null);
  const saveModalBackdropPressStartedRef = useRef(false);
  const hasManualMobileSelectionRef = useRef(false);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>([]);
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialMessagesRef = useRef<Message[] | null>(initialMessages);
  const initialMessagesConversationIdRef = useRef<number | null>(initialSelectedConversation?.id ?? initialSelectedConversationId);

  const readErrorMessage = async (response: Response): Promise<string | null> => {
    try {
      const payload = await response.json();
      if (payload && typeof payload.error === 'string') return payload.error;
      if (payload && typeof payload.message === 'string') return payload.message;
      return null;
    } catch {
      return null;
    }
  };

  const appendSyncLog = useCallback((level: SyncLogLevel, message: string) => {
    setSyncLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        level,
        message,
      },
      ...prev.slice(0, 11),
    ]);
  }, []);

  const showApiErrorToast = useCallback(
    (scope: string, status: number, message?: string | null) => {
      const normalizedMessage = (message || '').trim();
      const fallback =
        status === 429
          ? 'Prea multe cereri. Incearca din nou in cateva secunde.'
          : status === 401 || status === 403
            ? 'Sesiunea nu este valida pentru aceasta actiune. Reautentifica-te.'
            : 'A aparut o eroare la comunicarea cu serverul.';
      const finalMessage = normalizedMessage || fallback;
      const key = `${scope}:${status}:${finalMessage}`;
      const now = Date.now();
      const previous = lastApiErrorToastRef.current;
      if (previous && previous.key === key && now - previous.at < 8000) {
        return;
      }
      lastApiErrorToastRef.current = { key, at: now };
      toast.error(finalMessage);
    },
    [toast]
  );

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.replace('/login');
    }
  }, [sessionStatus, router]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      return;
    }
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
  }, [sessionStatus, initialConversations]);

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
    if (!isMobile) return;
    if (conversationParam) return;
    if (hasManualMobileSelectionRef.current) return;
    if (selectedConversation) {
      setSelectedConversation(null);
    }
  }, [isMobile, conversationParam, selectedConversation]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    if (loading) return;
    if (!searchQuery.trim() && allConversations.length > 0) return;

    if (inboxSearchDebounceRef.current) {
      clearTimeout(inboxSearchDebounceRef.current);
    }

    inboxSearchDebounceRef.current = setTimeout(() => {
      fetchConversations(searchQuery.trim());
    }, 250);

    return () => {
      if (inboxSearchDebounceRef.current) {
        clearTimeout(inboxSearchDebounceRef.current);
      }
    };
  }, [searchQuery, loading, sessionStatus]);

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

  // Filter conversations based on search + attachments toggle
  useEffect(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = allConversations.filter((conv) => {
      if (attachmentsOnly && !conv.has_attachments) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        conv.contact_name?.toLowerCase().includes(query) ||
        conv.contact_email?.toLowerCase().includes(query) ||
        conv.contact_phone?.toLowerCase().includes(query) ||
        conv.subject?.toLowerCase().includes(query)
      );
    });

    setConversations(filtered);
  }, [searchQuery, allConversations, attachmentsOnly]);

  const fetchConversations = async (serverSearch?: string) => {
    try {
      const isCurrentlyMobile =
        isMobile ||
        (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);

      const params = new URLSearchParams();
      const trimmedSearch = serverSearch?.trim();
      if (trimmedSearch) {
        params.set('search', trimmedSearch);
      }
      const queryString = params.toString();
      const response = await fetch(`/api/conversations${queryString ? `?${queryString}` : ''}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        const errorMessage = await readErrorMessage(response);
        showApiErrorToast('conversations', response.status, errorMessage);
        return;
      }
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
              setSelectedConversation(isCurrentlyMobile ? null : fallback);
            }
          } else if (!isCurrentlyMobile) {
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

  const fetchLatestSyncTimestamp = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/email-integrations', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      const integrations = Array.isArray(payload?.integrations) ? payload.integrations : [];
      const syncDates = integrations
        .map((integration: any) =>
          typeof integration?.last_sync_at === 'string' ? new Date(integration.last_sync_at) : null
        )
        .filter((date: Date | null): date is Date => date instanceof Date && !Number.isNaN(date.getTime()));

      if (syncDates.length === 0) {
        setLastSyncAt(null);
        return;
      }

      syncDates.sort((a: Date, b: Date) => b.getTime() - a.getTime());
      setLastSyncAt(syncDates[0].toISOString());
    } catch {
      // Ignore sync meta fetch errors to avoid noisy UI.
    }
  }, []);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    setTimeout(() => void fetchLatestSyncTimestamp(), 1000);
  }, [fetchLatestSyncTimestamp, sessionStatus]);

  const fetchMessages = async (conversationId: number, isInitial = false, beforeId?: number): Promise<Message[]> => {
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
      if (!response.ok) {
        const errorMessage = await readErrorMessage(response);
        showApiErrorToast('messages', response.status, errorMessage);
        return [];
      }
      const result = await response.json();
      const fetchedMessages: Message[] = result.messages || [];

      if (isInitial) {
        setMessages(fetchedMessages);
      } else {
        // Prepend older messages
        setMessages((prev) => [...fetchedMessages, ...prev]);
      }

      setHasMoreMessages(result.hasMore || false);
      setOldestMessageId(result.oldestMessageId || null);

      return fetchedMessages;
    } catch (error) {
      console.error('Error fetching messages:', error);
      return [];
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
    setSyncPartiallyFailed(false);
    appendSyncLog('info', 'Sincronizarea inbox a pornit.');
    try {
      const syncRequests: Array<{ provider: 'Yahoo' | 'Gmail'; request: Promise<Response> }> = [
        {
          provider: 'Yahoo',
          request: fetch('/api/yahoo/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ todayOnly: true }),
          }),
        },
        {
          provider: 'Gmail',
          request: fetch('/api/gmail/sync', { method: 'POST' }),
        },
      ];

      const settledResults = await Promise.allSettled(syncRequests.map((entry) => entry.request));
      const blockingErrors: string[] = [];
      let hasAtLeastOneProviderResult = false;

      for (let index = 0; index < settledResults.length; index += 1) {
        const provider = syncRequests[index].provider;
        const result = settledResults[index];

        if (result.status === 'rejected') {
          const reason = result.reason?.message || 'Cererea de sincronizare a esuat.';
          appendSyncLog('error', `${provider}: ${reason}`);
          blockingErrors.push(reason);
          continue;
        }

        const response = result.value;
        const payload = (await response.json().catch(() => ({}))) as ProviderSyncPayload;
        const responseMessage = payload?.error || payload?.message || payload?.reason || '';
        const normalizedMessage = responseMessage.toLowerCase();
        const isNotConfigured =
          normalizedMessage.includes('not configured') ||
          normalizedMessage.includes('not found');

        if (!response.ok) {
          if (isNotConfigured) {
            appendSyncLog('info', `${provider}: nu este conectat, sincronizarea a fost omisa.`);
          } else {
            const fallback = 'Sincronizarea a esuat.';
            const errorMessage = responseMessage || fallback;
            appendSyncLog('error', `${provider}: ${errorMessage}`);
            blockingErrors.push(errorMessage);
          }
          continue;
        }

        hasAtLeastOneProviderResult = true;
        const synced = typeof payload.synced === 'number' ? payload.synced : 0;
        const skipped = typeof payload.skipped === 'number' ? payload.skipped : 0;
        const errors = typeof payload.errors === 'number' ? payload.errors : 0;
        appendSyncLog(
          errors > 0 ? 'warning' : 'success',
          `${provider}: sincronizate ${synced}, omise ${skipped}, erori ${errors}.`
        );

        if (provider === 'Yahoo') {
          const attachmentFailures =
            typeof payload.attachmentFailures === 'number' ? payload.attachmentFailures : 0;
          if (attachmentFailures > 0) {
            const missingContent =
              typeof payload.attachmentMissingContent === 'number' ? payload.attachmentMissingContent : 0;
            const uploadFailures =
              typeof payload.attachmentUploadFailures === 'number' ? payload.attachmentUploadFailures : 0;
            appendSyncLog(
              'warning',
              `Yahoo: ${attachmentFailures} atasamente nu au putut fi salvate (${missingContent} fara continut, ${uploadFailures} upload esuat).`
            );
          }
        }
      }

      if (blockingErrors.length > 0) {
        showApiErrorToast('sync', 500, blockingErrors[0]);
        setSyncError(blockingErrors[0]);
        setSyncPartiallyFailed(true);
      } else if (hasAtLeastOneProviderResult) {
        appendSyncLog('success', 'Sincronizarea inbox s-a incheiat.');
      } else {
        appendSyncLog('info', 'Niciun provider activ pentru sincronizare.');
      }

      await fetchConversations(searchQuery);
      await fetchLatestSyncTimestamp();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sync inbox';
      setSyncError(message);
      setSyncPartiallyFailed(false);
      appendSyncLog('error', `Inbox: ${message}`);
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

      if (!response.ok) {
        const errorMessage = await readErrorMessage(response);
        showApiErrorToast('send-message', response.status, errorMessage);
        return;
      }

      if (response.ok) {
        setNewMessage('');
        // Reload messages to show the new one (fetch latest messages)
        fetchMessages(selectedConversation.id, true);
        fetchConversations(searchQuery);
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
    if (isMobile) {
      hasManualMobileSelectionRef.current = true;
    }
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

  const mapMessagesToSaveableItems = useCallback((msgs: Message[]): SaveableItem[] => {
    const items: SaveableItem[] = [];
    for (const message of msgs) {
      for (const [index, attachment] of (message.attachments || []).entries()) {
        const filename = attachment.filename || `Attachment #${index + 1}`;
        items.push({
          key: `attachment:${message.id}:${attachment.id ?? index}`,
          type: 'attachment',
          messageId: message.id,
          attachmentId: attachment.id,
          label: `${filename} (${Math.round((attachment.size || 0) / 1024)}KB)`,
          savable: Boolean(attachment.id && attachment.persisted),
          savedAt: attachment.last_saved_at,
          savedClients: Array.isArray(attachment.saved_client_ids) ? attachment.saved_client_ids : [],
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
          savedAt: image.last_saved_at,
          savedClients: Array.isArray(image.saved_client_ids) ? image.saved_client_ids : [],
        });
      }
    }
    return items;
  }, []);

  const saveableItems = useMemo<SaveableItem[]>(
    () => mapMessagesToSaveableItems(messages),
    [messages, mapMessagesToSaveableItems]
  );

  useEffect(() => {
    if (!saveModalOpen) return;
    const savedClientIds = Array.from(new Set(
      saveableItems.flatMap((item) =>
        item.savedClients
          .map((entry) => entry.clientId)
          .filter((clientId): clientId is number => typeof clientId === 'number' && clientId > 0)
      )
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
      return item.savedClients.some((entry) => entry.clientId === clientId);
    },
    []
  );

  const isAnySavedClient = useCallback((item: SaveableItem): boolean => item.savedClients.length > 0, []);

  // Fix 1: centralised close that fully resets all modal state
  const closeSaveModal = useCallback(() => {
    setSaveModalOpen(false);
    setClientSearch('');
    setHasActivatedClientSearch(false);
    setSelectedTargetClientId(null);
    setSelectedSaveItemKeys([]);
    setRemovingClientChipKeys([]);
    setClientOptions([]);
    setSaveModalLoading(false);
  }, []);

  const openSaveModal = async () => {
    if (!selectedConversation) return;

    // Fix 6: show loading state while we fetch fresh messages
    setSaveModalLoading(true);
    setSaveModalOpen(true);
    setClientSearch('');
    setHasActivatedClientSearch(false);
    setSelectedSaveItemKeys([]);
    setRemovingClientChipKeys([]);
    setClientOptions([]);

    const defaultClientId =
      typeof selectedConversation.client_id === 'number' && selectedConversation.client_id > 0
        ? selectedConversation.client_id
        : null;
    setSelectedTargetClientId(defaultClientId);

    // Fix 2: fetch fresh messages BEFORE computing defaults so stale saved-state
    // from a previous save session does not incorrectly re-select already-saved items.
    const freshMessages = await fetchMessages(selectedConversation.id, true);

    // Fix 2 + 3: compute default keys inline from the fresh messages rather than
    // the potentially stale saveableItems memo.  Exclude anything already saved to
    // ANY client (Fix 3), not just the default one.
    const freshItems = mapMessagesToSaveableItems(freshMessages);

    // Fix 3: exclude items already saved to ANY client, not just the default client
    const defaultKeys = freshItems
      .filter((item) => {
        if (!item.savable) return false;
        if (isAnySavedClient(item)) return false;
        return true;
      })
      .map((item) => item.key);
    setSelectedSaveItemKeys(defaultKeys);

    setSaveModalLoading(false);

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

  const buildClientChipKey = useCallback(
    (itemKey: string, clientId: number, fileId: number) => `${itemKey}:${clientId}:${fileId}`,
    []
  );

  const removeFileFromClient = useCallback(
    async (itemKey: string, clientId: number, fileId: number) => {
      if (!selectedConversation) return;

      const chipKey = buildClientChipKey(itemKey, clientId, fileId);
      setRemovingClientChipKeys((prev) => (prev.includes(chipKey) ? prev : [...prev, chipKey]));

      try {
        const response = await fetch(`/api/clients/${clientId}/files/${fileId}`, { method: 'DELETE' });
        if (!response.ok) {
          const errorMessage = await readErrorMessage(response);
          throw new Error(errorMessage || 'Nu am putut elimina fisierul de la client.');
        }

        const freshMessages = await fetchMessages(selectedConversation.id, true);
        const refreshedItems = mapMessagesToSaveableItems(freshMessages);
        const refreshedItem = refreshedItems.find((entry) => entry.key === itemKey);

        if (selectedTargetClientId === clientId) {
          if (
            refreshedItem &&
            refreshedItem.savable &&
            !isItemAlreadySavedForClient(refreshedItem, selectedTargetClientId)
          ) {
            setSelectedSaveItemKeys((prev) => (prev.includes(itemKey) ? prev : [...prev, itemKey]));
          }
        }
      } catch (error) {
        console.error('Failed to remove file from client:', error);
        toast.error(error instanceof Error ? error.message : 'Eroare la eliminarea fisierului.');
      } finally {
        setRemovingClientChipKeys((prev) => prev.filter((entry) => entry !== chipKey));
      }
    },
    [
      buildClientChipKey,
      fetchMessages,
      isItemAlreadySavedForClient,
      mapMessagesToSaveableItems,
      readErrorMessage,
      selectedConversation,
      selectedTargetClientId,
      toast,
    ]
  );

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
      await fetchConversations(searchQuery);
      // Fix 4: clear selected keys after a successful save so stale selection
      // does not persist if the user reopens or stays in the modal
      setSelectedSaveItemKeys([]);
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
    if (item.savedClients.length > 1) {
      return `Salvat la ${item.savedClients.length} pacienti`;
    }
    if (item.savedClients.length === 1) {
      const patientName = getPatientNameById(item.savedClients[0].clientId);
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
      saved_client_ids?: Array<{ clientId: number; fileId: number }>;
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
                : Array.isArray(att.saved_client_ids) && att.saved_client_ids.length === 1
                ? `Salvat la pacient ${getPatientNameById(att.saved_client_ids[0].clientId)}`
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
      saved_client_ids?: Array<{ clientId: number; fileId: number }>;
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
                  : Array.isArray(image.saved_client_ids) && image.saved_client_ids.length === 1
                  ? `Salvata la pacient ${getPatientNameById(image.saved_client_ids[0].clientId)}`
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

  const handleSaveModalBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    saveModalBackdropPressStartedRef.current = event.target === event.currentTarget;
  };

  const handleSaveModalBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const endedOnBackdrop = event.target === event.currentTarget;
    if (saveModalBackdropPressStartedRef.current && endedOnBackdrop) {
      closeSaveModal();
    }
    saveModalBackdropPressStartedRef.current = false;
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

  const showThread = !isMobile || selectedConversation !== null;
  const showList = !isMobile || selectedConversation === null;

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
          className={`${styles.conversationList}${!showList ? ` ${styles.conversationListHidden}` : ''}`}
          style={{ width: isMobile ? undefined : `${leftWidth}px` }}
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
              <span className={styles.syncButtonInner}>
                {syncing && <span className={styles.syncSpinner} aria-hidden="true" />}
                <span>{syncing ? 'Sincronizare inbox' : 'Sincronizeaza Inbox'}</span>
              </span>
            </button>
            {syncPartiallyFailed && syncError && (
              <div className={styles.syncError}>
                Sincronizare partiala: {syncError}
              </div>
            )}
            {!syncPartiallyFailed && syncError && (
              <div className={styles.syncError}>{syncError}</div>
            )}
            <div className={styles.filtersRow}>
              <button
                type="button"
                className={`${styles.filterButton}${attachmentsOnly ? ` ${styles.filterButtonActive}` : ''}`}
                onClick={() => setAttachmentsOnly((prev) => !prev)}
              >
                {attachmentsOnly ? 'Arata toate emailurile' : 'Doar cu atasamente'}
              </button>
            </div>
            {lastSyncAt && (
              <div className={styles.lastSyncLabel}>
                Ultima sincronizare: {format(new Date(lastSyncAt), 'dd.MM.yyyy HH:mm')}
              </div>
            )}
            {syncLogs.length > 0 && (
              <div className={styles.syncLogPanel}>
                <div className={styles.syncLogHeader}>Jurnal sincronizare</div>
                <div className={styles.syncLogList}>
                  {syncLogs.map((entry) => (
                    <div key={entry.id} className={`${styles.syncLogItem} ${styles[`syncLog${entry.level.charAt(0).toUpperCase()}${entry.level.slice(1)}`]}`}>
                      <span className={styles.syncLogTime}>{format(new Date(entry.at), 'HH:mm:ss')}</span>
                      <span className={styles.syncLogMessage}>{entry.message}</span>
                    </div>
                  ))}
                </div>
              </div>
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
                  {conv.has_attachments && (
                    <span className={styles.attachmentBadge} title="Contine atasamente" aria-label="Contine atasamente">
                      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M16.5 6.5a4 4 0 0 0-5.66 0L5.31 12a6 6 0 1 0 8.49 8.49l5.18-5.19a3.5 3.5 0 1 0-4.95-4.95L8.5 15.88a1.5 1.5 0 1 0 2.12 2.12l4.6-4.6 1.06 1.06-4.6 4.6a3 3 0 1 1-4.24-4.24l5.53-5.53a5 5 0 0 1 7.07 7.07l-5.18 5.19A7.5 7.5 0 1 1 4.25 10.94l5.53-5.53a5.5 5.5 0 0 1 7.78 7.78l-5.89 5.9-1.06-1.07 5.89-5.89a4 4 0 0 0 0-5.66Z"
                        />
                      </svg>
                    </span>
                  )}
                  {conv.has_unread && (
                    <div className={styles.unreadBadge} aria-label="Unread conversation" />
                  )}
                </div>
                <div className={styles.conversationMeta}>
                  <span className={getChannelClassName(styles, conv.channel, conv.email_provider)}>{getChannelLabel(conv.channel, conv.email_provider)}</span>
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

        <div className={`${styles.thread}${showThread && isMobile ? ` ${styles.threadVisible}` : ''}`}>
          {selectedConversation ? (
            <>
              <div className={styles.threadHeader}>
                <div className={styles.threadHeaderTop}>
                  <button
                    type="button"
                    className={styles.mobileBackButton}
                    onClick={() => setSelectedConversation(null)}
                    aria-label="Inapoi la conversatii"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                    Inapoi
                  </button>
                  <div className={styles.threadContact}>
                    <h3>{selectedConversation.contact_name || 'Fără nume'}</h3>
                    <div className={styles.threadMeta}>
                      {selectedConversation.contact_email} • {getChannelLabel(selectedConversation.channel, selectedConversation.email_provider)}
                    </div>
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

      {saveModalOpen && (() => {
        // Derive the currently selected client object for chip display
        const selectedClient = selectedTargetClientId
          ? clientOptions.find((c) => c.id === selectedTargetClientId) ?? null
          : null;

        // Split items into two groups
        const attachmentItems = saveableItems.filter((i) => i.type === 'attachment');
        const imageItems = saveableItems.filter((i) => i.type === 'image');

        // Count of items actually pending selection (not already saved for target)
        const pendingCount = selectedSaveItemKeys.filter((k) => {
          const item = saveableItems.find((i) => i.key === k);
          return item && !isItemAlreadySavedForClient(item, selectedTargetClientId);
        }).length;

        // Helper: derive file-type label + icon class from item label / type
        const getFileTypeInfo = (item: SaveableItem): { ext: string; iconClass: string } => {
          if (item.type === 'image') {
            return { ext: 'IMG', iconClass: styles.fileTypeIconImage };
          }
          const match = item.label.match(/\.([a-zA-Z0-9]+)\s*\(/);
          const ext = match ? match[1].toUpperCase() : 'FILE';
          if (ext === 'PDF') return { ext, iconClass: styles.fileTypeIconPdf };
          if (['DOC', 'DOCX'].includes(ext)) return { ext, iconClass: styles.fileTypeIconDoc };
          if (['XLS', 'XLSX', 'CSV'].includes(ext)) return { ext, iconClass: styles.fileTypeIconSheet };
          if (['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'SVG'].includes(ext)) return { ext, iconClass: styles.fileTypeIconImage };
          return { ext: ext.slice(0, 4), iconClass: styles.fileTypeIconDefault };
        };

        // Helper: extract just the filename from the label (strips the "(XKB)" size suffix)
        const getItemDisplayName = (item: SaveableItem): { name: string; size: string } => {
          const match = item.label.match(/^(.+?)\s*\((\d+KB)\)$/);
          if (match) return { name: match[1], size: match[2] };
          return { name: item.label, size: '' };
        };

        // Helper: get initials from client name
        const getInitials = (name: string) => {
          const parts = name.trim().split(/\s+/);
          if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          return name.slice(0, 2).toUpperCase();
        };

        const renderStatusPill = (item: SaveableItem) => {
          if (savingItemKey === item.key) {
            return (
              <span className={`${styles.saveItemStatusPill} ${styles.saveItemStatusPillSaving}`}>
                <span className={styles.clientSearchSpinner} aria-hidden="true" />
                Se salveaza...
              </span>
            );
          }
          if (!item.savable) {
            return (
              <span className={`${styles.saveItemStatusPill} ${styles.saveItemStatusPillDisabled}`}>
                Indisponibil
              </span>
            );
          }
          if (isItemAlreadySavedForClient(item, selectedTargetClientId)) {
            return (
              <span className={`${styles.saveItemStatusPill} ${styles.saveItemStatusPillSaved}`}>
                {/* checkmark */}
                <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                Salvat
              </span>
            );
          }
          if (isAnySavedClient(item)) {
            const savedNames = item.savedClients
              .map((entry) => getPatientNameById(entry.clientId))
              .join(', ');
            return (
              <span
                className={`${styles.saveItemStatusPill} ${styles.saveItemStatusPillSaved}`}
                title={savedNames ? `Salvat la: ${savedNames}` : 'Salvat la alt client'}
                style={{ opacity: 0.75 }}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {item.savedClients.length > 1 ? `Salvat (${item.savedClients.length})` : 'Salvat alt client'}
              </span>
            );
          }
          return (
            <span className={`${styles.saveItemStatusPill} ${styles.saveItemStatusPillUnsaved}`}>
              Nesalvat
            </span>
          );
        };

        const renderToggle = (item: SaveableItem) => {
          const isSaved = isItemAlreadySavedForClient(item, selectedTargetClientId);
          const isDisabled = !item.savable || isSavingSelection || isSaved;
          const isChecked = selectedSaveItemKeys.includes(item.key);

          let toggleClass = styles.saveItemToggle;
          if (isSaved) toggleClass += ` ${styles.saveItemToggleSaved}`;
          else if (isDisabled) toggleClass += ` ${styles.saveItemToggleDisabled}`;
          else if (isChecked) toggleClass += ` ${styles.saveItemToggleChecked}`;

          return (
            <div className={toggleClass} aria-hidden="true">
              {isSaved ? (
                <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M1.5 5.5l2.8 2.8 5-5.5" stroke="#34d399" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              ) : isChecked && !isDisabled ? (
                <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true"><path d="M1.5 5.5l2.8 2.8 5-5.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
              ) : null}
            </div>
          );
        };

        const renderItemCard = (item: SaveableItem) => {
          const isSaved = isItemAlreadySavedForClient(item, selectedTargetClientId);
          const isDisabled = !item.savable || isSavingSelection || isSaved;
          const isChecked = selectedSaveItemKeys.includes(item.key);
          const hasSavedClients = item.savedClients.length > 0;
          const { ext, iconClass } = getFileTypeInfo(item);
          const { name, size } = getItemDisplayName(item);

          let rowClass = styles.saveItemRow;
          if (isSaved) rowClass += ` ${styles.saveItemRowSaved}`;
          else if (isDisabled) rowClass += ` ${styles.saveItemRowDisabled}`;
          else if (isChecked) rowClass += ` ${styles.saveItemRowSelected}`;

          return (
            <label
              key={item.key}
              className={rowClass}
              title={formatSaveStatus(item)}
              style={{ cursor: isDisabled ? undefined : 'pointer' }}
            >
              <input
                type="checkbox"
                className={styles.saveItemNativeCheckbox}
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => handleToggleSaveItem(item.key)}
                aria-label={`${name} — ${formatSaveStatus(item)}`}
              />
              {renderToggle(item)}
              <div className={`${styles.fileTypeIcon} ${iconClass}`}>
                {item.type === 'image' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M21 15l-5-5L11 15l-3-3-5 5v2a2 2 0 002 2h16a2 2 0 002-2v-2zM4 4h16a2 2 0 012 2v8l-5-5-5 5-3-3-5 5V6a2 2 0 012-2z" opacity=".9"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                  </svg>
                ) : (
                  <span>{ext}</span>
                )}
              </div>
              <div className={styles.saveItemMeta}>
                <div className={styles.saveItemName}>{name}</div>
                {size && <div className={styles.saveItemSize}>{size}</div>}
                {hasSavedClients && (
                  <div
                    className={styles.savedClientsRow}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    <span className={styles.savedClientsLabel}>Salvat la:</span>
                    {item.savedClients.map((entry) => {
                      const chipKey = buildClientChipKey(item.key, entry.clientId, entry.fileId);
                      const isRemoving = removingClientChipKeys.includes(chipKey);
                      const clientName = getPatientNameById(entry.clientId);
                      const chipClass = isRemoving
                        ? `${styles.savedClientChip} ${styles.savedClientChipRemoving}`
                        : styles.savedClientChip;

                      return (
                        <span key={chipKey} className={chipClass} title={clientName}>
                          <span className={styles.savedClientChipAvatar}>{getInitials(clientName)}</span>
                          <span className={styles.savedClientChipName}>{clientName}</span>
                          <button
                            type="button"
                            className={styles.savedClientChipRemove}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void removeFileFromClient(item.key, entry.clientId, entry.fileId);
                            }}
                            disabled={isRemoving || isSavingSelection}
                            aria-label={`Elimina fisierul pentru ${clientName}`}
                            title={`Elimina pentru ${clientName}`}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              {renderStatusPill(item)}
            </label>
          );
        };

        const renderGroup = (items: SaveableItem[], groupLabel: string, groupIcon: React.ReactNode) => {
          if (items.length === 0) return null;
          return (
            <div className={styles.saveModalSection}>
              <div className={styles.attachmentGroupLabel}>
                <span className={styles.attachmentGroupLabelIcon}>{groupIcon}</span>
                {groupLabel}
              </div>
              <div className={styles.saveItemList}>
                {items.map(renderItemCard)}
              </div>
            </div>
          );
        };

        return (
          <div
            className={styles.saveModalBackdrop}
            onPointerDown={handleSaveModalBackdropPointerDown}
            onClick={handleSaveModalBackdropClick}
          >
            <div className={styles.saveModal} onClick={(e) => e.stopPropagation()}>

              {/* ---- Header ---- */}
              <div className={styles.saveModalHeader}>
                <div className={styles.saveModalTitleGroup}>
                  <h4 className={styles.saveModalTitle}>Salveaza atasamente si poze</h4>
                  <div className={styles.saveModalSubtitle}>
                    {saveableItems.length === 0
                      ? 'Niciun element detectat in conversatie'
                      : `${saveableItems.length} element${saveableItems.length !== 1 ? 'e' : ''} detectat${saveableItems.length !== 1 ? 'e' : ''} in conversatie`}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.modalCloseButton}
                  onClick={closeSaveModal}
                  aria-label="Inchide"
                  title="Inchide (Esc)"
                >
                  ✕
                </button>
              </div>

              {/* ---- Scrollable body ---- */}
              <div className={styles.saveModalBody}>

                {/* Fix 6: loading state while refreshing messages before showing content */}
                {saveModalLoading && (
                  <div className={styles.modalHint} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1.5rem 0' }}>
                    <span className={styles.clientSearchSpinner} aria-hidden="true" />
                    Se incarca datele actualizate...
                  </div>
                )}

                {/* Fix 6: hide content while fresh messages are being loaded */}
                {!saveModalLoading && (
                  <>
                {/* Client section */}
                <div className={styles.saveModalSection}>
                  <div className={styles.saveModalSectionHeader}>
                    <div className={styles.saveModalLabel}>Client destinatie</div>
                  </div>

                  {/* If a client is already selected, show chip; otherwise show search */}
                  {selectedClient ? (
                    <div className={styles.selectedClientChip}>
                      <div className={styles.clientAvatar}>{getInitials(selectedClient.name)}</div>
                      <div className={styles.selectedClientInfo}>
                        <div className={styles.selectedClientName}>{selectedClient.name}</div>
                        {selectedClient.email && (
                          <div className={styles.selectedClientEmail}>{selectedClient.email}</div>
                        )}
                      </div>
                      <button
                        type="button"
                        className={styles.clientChipDismiss}
                        onClick={() => {
                          setSelectedTargetClientId(null);
                          setClientSearch('');
                        }}
                        aria-label="Sterge selectia clientului"
                        title="Sterge selectia"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className={styles.clientSearchWrapper}>
                      <span className={styles.clientSearchIcon} aria-hidden="true">
                        {loadingClientOptions ? (
                          <span className={styles.clientSearchSpinner} />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                          </svg>
                        )}
                      </span>
                      <input
                        type="text"
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        onFocus={() => setHasActivatedClientSearch(true)}
                        className={styles.clientSearchInput}
                        placeholder="Cauta client dupa nume, email sau telefon..."
                        autoComplete="off"
                      />
                    </div>
                  )}

                  {/* Dropdown results (only when no client selected and search active) */}
                  {!selectedClient && hasActivatedClientSearch && clientSearch.trim().length > 0 && (
                    <div className={styles.clientDropdown}>
                      {clientOptions
                        .filter((c) => c.id !== selectedTargetClientId)
                        .map((client) => (
                          <button
                            key={client.id}
                            type="button"
                            className={styles.clientDropdownItem}
                            onClick={() => {
                              setSelectedTargetClientId(client.id);
                              setClientSearch('');
                            }}
                          >
                            <div className={styles.clientDropdownAvatar}>{getInitials(client.name)}</div>
                            <span className={styles.clientDropdownName}>{client.name}</span>
                            {client.email && (
                              <span className={styles.clientDropdownEmail}>{client.email}</span>
                            )}
                          </button>
                        ))}
                      {!loadingClientOptions && clientOptions.filter((c) => c.id !== selectedTargetClientId).length === 0 && (
                        <div className={styles.modalHint}>Nu am gasit clienti pentru cautarea curenta.</div>
                      )}
                    </div>
                  )}

                  {!selectedTargetClientId && (
                    <div className={styles.modalHintAutoCreate}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '1px', opacity: 0.7 }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
                      Daca nu alegi un client, sistemul va crea automat unul nou la prima salvare.
                    </div>
                  )}
                </div>

                {/* Attachments section */}
                {saveableItems.length === 0 ? (
                  <div className={styles.modalHint}>
                    Nu exista atasamente sau poze inline de salvat in aceasta conversatie.
                  </div>
                ) : (
                  <>
                    {renderGroup(
                      attachmentItems,
                      'Documente si fisiere',
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    )}
                    {renderGroup(
                      imageItems,
                      'Poze inline',
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    )}
                  </>
                )}
                  </>
                )}

              </div>

              {/* ---- Footer actions ---- */}
              <div className={styles.saveModalActions}>
                <button
                  type="button"
                  className={styles.saveModalCancelButton}
                  onClick={closeSaveModal}
                  disabled={isSavingSelection}
                >
                  Anuleaza
                </button>
                <button
                  type="button"
                  className={styles.saveModalSaveButton}
                  onClick={saveSelectedItems}
                  disabled={isSavingSelection || saveModalLoading || pendingCount === 0}
                >
                  {isSavingSelection ? (
                    <>
                      <span className={styles.clientSearchSpinner} aria-hidden="true" style={{ borderTopColor: 'currentColor' }} />
                      Se salveaza...
                    </>
                  ) : (
                    <>
                      Salveaza
                      {pendingCount > 0 && (
                        <span className={styles.saveModalSaveBadge}>{pendingCount}</span>
                      )}
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        );
      })()}
      <ToastContainer toasts={toast.toasts} onClose={toast.removeToast} />
    </div>
  );
}


