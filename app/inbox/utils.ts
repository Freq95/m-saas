/**
 * Utility functions for inbox
 */

import { format, isSameDay, isToday, isYesterday } from 'date-fns';
import type { Message, GroupedMessageItem } from './types';

/**
 * Format date for message timestamp (HH:mm)
 */
export function formatMessageTime(date: Date | null): string {
  if (!date || isNaN(date.getTime())) {
    return '';
  }
  
  try {
    return format(date, 'HH:mm');
  } catch (error) {
    console.warn('Error formatting message time:', error);
    return '';
  }
}

/**
 * Format date for date separator
 */
export function formatDateSeparator(date: Date): string {
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
}

/**
 * Format conversation last message time
 */
export function formatConversationTime(dateString: string | null | undefined): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return 'Ieri';
    } else {
      return format(date, 'dd.MM');
    }
  } catch (e) {
    return '';
  }
}

/**
 * Parse message content for search
 * Handles both old format (plain text) and new format (JSON with text/html)
 */
export function parseMessageContentForSearch(msg: Message): string {
  if (msg.content) {
    // Try to parse as JSON first (new format)
    try {
      const parsed = JSON.parse(msg.content);
      return parsed.text || parsed.html?.replace(/<[^>]*>/g, '') || '';
    } catch {
      // Not JSON, use as plain text
      return msg.content;
    }
  }
  return msg.text || '';
}

/**
 * Group messages and add date separators
 */
export function groupMessagesWithDateSeparators(messages: Message[]): GroupedMessageItem[] {
  if (!messages || messages.length === 0) return [];

  const grouped: GroupedMessageItem[] = [];
  let lastDate: Date | null = null;

  messages.forEach((msg) => {
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
}

/**
 * Extract body content from HTML string
 */
export function extractBodyContent(html: string): string {
  // If HTML contains full document structure, extract just the body
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1];
  }
  
  // Remove html/head tags if present
  return html
    .replace(/^<html[^>]*>/i, '')
    .replace(/<\/html>$/i, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/^<body[^>]*>|<\/body>$/gi, '');
}

/**
 * Check if HTML content is valid and non-empty
 */
export function isValidHtmlContent(html: string | undefined): boolean {
  if (!html || !html.trim()) return false;
  
  const bodyContent = extractBodyContent(html);
  const textContent = bodyContent.replace(/<[^>]*>/g, '').trim();
  
  // Valid if has text content or images
  return textContent.length > 0 || bodyContent.match(/<img/i) !== null;
}

