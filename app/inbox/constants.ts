/**
 * Constants for inbox functionality
 */

export const INBOX_CONFIG = {
  AUTO_REFRESH_INTERVAL: 30000, // 30 seconds
  MESSAGES_PER_PAGE: 50,
  SEARCH_MESSAGES_LIMIT: 10,
  SCROLL_THRESHOLD: 200, // pixels from top to trigger load more
  AUTO_SCROLL_THRESHOLD: 100, // pixels from bottom to auto-scroll
  MIN_LEFT_WIDTH: 200,
  MIN_RIGHT_WIDTH: 300,
  DEFAULT_LEFT_WIDTH: 380,
  IFRAME_DEFAULT_HEIGHT: 600,
  IFRAME_MIN_HEIGHT: 200,
  IFRAME_MAX_RETRIES: 3,
  IFRAME_RETRY_DELAY: 300,
  IFRAME_IMAGE_LOAD_TIMEOUT: 2000,
} as const;

export const API_ENDPOINTS = {
  CONVERSATIONS: '/api/conversations',
  CONVERSATION_MESSAGES: (id: number) => `/api/conversations/${id}`,
  SUGGEST_RESPONSE: (id: number) => `/api/conversations/${id}/suggest-response`,
  SEND_MESSAGE: (id: number) => `/api/conversations/${id}/messages`,
} as const;

export const DOMPURIFY_CONFIG = {
  WHOLE_DOCUMENT: true,
  ADD_TAGS: ['style', 'meta', 'link'],
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
} as const;

