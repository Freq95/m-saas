/**
 * Yahoo Mail Integration
 * Handles reading emails via IMAP and sending via SMTP
 */

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { ObjectId } from 'mongodb';
import { logger } from './logger';

interface YahooConfig {
  email: string;
  password: string;
  appPassword?: string; // App-specific password (recommended)
}

interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  content?: Buffer;
}

interface EmailImage {
  cid?: string;
  filename?: string;
  contentType: string;
  url?: string;
  data?: string; // base64
}

interface EmailMessage {
  uid: number;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  date: Date;
  receivedAt?: Date;
  messageId?: string;
  attachments?: EmailAttachment[];
  images?: EmailImage[];
  cleanText?: string; // Cleaned text without special characters
}

/**
 * Clean text content - remove special invisible characters and normalize
 */
function cleanText(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width spaces
    .replace(/[\u2060-\u206F]/g, '') // Word joiner and invisible separators
    .replace(/[\u202A-\u202E]/g, '') // Bidirectional text marks
    .replace(/[\u00AD]/g, '') // Soft hyphens
    .replace(/[\u034F\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uFEFF]/g, '') // More invisible chars
    .replace(/\s+/g, ' ') // Multiple spaces to single space
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple newlines to double newline
    .trim();
}

/**
 * Extract images from parsed email
 * Inline images (CID) are handled separately, this extracts external images from HTML
 */
function extractImagesFromHtml(html: string, parsed: any): EmailImage[] {
  const images: EmailImage[] = [];
  
  if (!html) return images;
  
  // Extract inline images (CID images) from attachments
  if (parsed.attachments) {
    for (const attachment of parsed.attachments) {
      if (attachment.contentType?.startsWith('image/') && attachment.cid) {
        images.push({
          cid: attachment.cid,
          filename: attachment.filename || 'image',
          contentType: attachment.contentType,
          data: attachment.content ? attachment.content.toString('base64') : undefined,
        });
      }
    }
  }
  
  return images;
}

/**
 * Extract attachments from parsed email
 */
function extractAttachments(parsed: any): EmailAttachment[] {
  const attachments: EmailAttachment[] = [];
  
  if (!parsed.attachments) return attachments;
  
  for (const attachment of parsed.attachments) {
    // Skip inline images (they're handled separately)
    if (attachment.contentType && attachment.contentType.startsWith('image/') && attachment.cid) {
      continue;
    }
    
    attachments.push({
      filename: attachment.filename || 'attachment',
      contentType: attachment.contentType || 'application/octet-stream',
      size: attachment.size || 0,
      contentId: attachment.cid,
      content: attachment.content,
    });
  }
  
  return attachments;
}

/**
 * Get Yahoo Mail configuration from database (no environment fallback).
 */
export async function getYahooConfig(userId?: number, tenantId?: ObjectId): Promise<YahooConfig | null> {
  if (!userId || !tenantId) {
    return null;
  }

  try {
    const { getEmailIntegrationConfig } = await import('./email-integrations');
    const config = await getEmailIntegrationConfig(userId, tenantId, 'yahoo');
    if (!config?.password) {
      return null;
    }
    return {
      email: config.email,
      password: config.password,
      appPassword: config.password,
    };
  } catch (error) {
    logger.warn('Failed to get Yahoo config from database', { error, userId });
    return null;
  }
}

/**
 * Connect to Yahoo Mail IMAP and fetch new emails
 */
export async function fetchYahooEmails(
  config: YahooConfig,
  since?: Date,
  sinceUid?: number
): Promise<EmailMessage[]> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.email,
      password: config.password,
      host: 'imap.mail.yahoo.com',
      port: 993,
      tls: true,
    });

    const emails: EmailMessage[] = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        // Prefer UID cursor for incremental sync (fast path).
        // Fallback to date search for initial sync.
        const searchCriteria = sinceUid && sinceUid > 0
          ? [['UID', `${sinceUid + 1}:*`]]
          : (since
            ? [['SINCE', since]]  // All emails since date (read + unread)
            : ['UNSEEN']);        // Only unread if no date/cursor specified

        logger.debug('Yahoo IMAP search started', {
          useUidCursor: Boolean(sinceUid && sinceUid > 0),
          hasSinceDate: Boolean(since),
        });
        imap.search(searchCriteria, (err, results) => {
          if (err) {
            logger.error('Yahoo IMAP search failed', err instanceof Error ? err : new Error(String(err)));
            imap.end();
            return reject(err);
          }
          
          if (!results || results.length === 0) {
            logger.info('Yahoo IMAP search returned no messages');
            imap.end();
            return resolve(emails);
          }

          logger.info('Yahoo IMAP search found messages', { count: results.length });

          const fetch = imap.fetch(results, {
            bodies: '',
            struct: true,
          });

          let processedCount = 0;
          const totalEmails = results.length;

          fetch.on('message', (msg, seqno) => {
            let emailData: Partial<EmailMessage> = {};
            let uid: number | undefined;
            let receivedAt: Date | undefined;
            let bodyBuffer = '';
            let parsingComplete = false;

            msg.once('attributes', (attrs) => {
              uid = attrs.uid;
              emailData.uid = attrs.uid;
              if (attrs?.date instanceof Date && !Number.isNaN(attrs.date.getTime())) {
                receivedAt = attrs.date;
              }
            });

            msg.on('body', (stream, info) => {
              stream.on('data', (chunk) => {
                bodyBuffer += chunk.toString('utf8');
              });

              stream.on('end', () => {
                simpleParser(bodyBuffer, (err: any, parsed: any) => {
                  if (err) {
                    logger.error('Yahoo IMAP parse failed', err instanceof Error ? err : new Error(String(err)));
                    parsingComplete = true;
                    processedCount++;
                    checkIfDone();
                    return;
                  }

                  if (parsed && uid) {
                    // Extract from address
                    let fromAddress = '';
                    if (parsed.from) {
                      if (typeof parsed.from === 'string') {
                        fromAddress = parsed.from;
                      } else if (parsed.from.text) {
                        fromAddress = parsed.from.text;
                      } else if (Array.isArray(parsed.from.value) && parsed.from.value.length > 0) {
                        fromAddress = parsed.from.value[0].address || '';
                      } else if ((parsed.from as any).value && Array.isArray((parsed.from as any).value)) {
                        fromAddress = (parsed.from as any).value[0]?.address || '';
                      }
                    }

                    // Extract to address
                    let toAddress = '';
                    if (parsed.to) {
                      if (typeof parsed.to === 'string') {
                        toAddress = parsed.to;
                      } else if (parsed.to.text) {
                        toAddress = parsed.to.text;
                      } else if (Array.isArray(parsed.to.value) && parsed.to.value.length > 0) {
                        toAddress = parsed.to.value[0].address || '';
                      }
                    }

                    // Clean text content
                    const cleanTextContent = cleanText(parsed.text || '');
                    
                    // Process HTML: replace CID images with base64 data URIs
                    let processedHtml = parsed.html;
                    if (processedHtml && parsed.attachments) {
                      for (const attachment of parsed.attachments) {
                        if (attachment.contentType?.startsWith('image/') && attachment.cid && attachment.content) {
                          const base64 = attachment.content.toString('base64');
                          const dataUri = `data:${attachment.contentType};base64,${base64}`;
                          // Replace cid: references in HTML
                          processedHtml = processedHtml.replace(
                            new RegExp(`cid:${attachment.cid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'),
                            dataUri
                          );
                        }
                      }
                    }
                    
                    // Extract images and attachments
                    const images = processedHtml ? extractImagesFromHtml(processedHtml, parsed) : [];
                    const attachments = extractAttachments(parsed);

                    emailData = {
                      uid,
                      from: fromAddress,
                      to: toAddress,
                      subject: parsed.subject || '',
                      text: parsed.text || '',
                      cleanText: cleanTextContent,
                      html: processedHtml || undefined,
                      date: parsed.date || new Date(),
                      receivedAt,
                      messageId: parsed.messageId,
                      images: images.length > 0 ? images : undefined,
                      attachments: attachments.length > 0 ? attachments : undefined,
                    };

                    parsingComplete = true;
                    
                    if (emailData.uid && emailData.from) {
                      logger.debug('Yahoo IMAP parsed message', { uid: emailData.uid });
                      emails.push(emailData as EmailMessage);
                    } else {
                      logger.warn('Yahoo IMAP skipped message due to missing fields', { uid: emailData.uid ?? null });
                    }
                  } else {
                    parsingComplete = true;
                    logger.warn('Yahoo IMAP skipped message due to missing parsed payload');
                  }

                  processedCount++;
                  checkIfDone();
                });
              });
            });

            msg.once('end', () => {
              // If parsing didn't complete yet, wait for it
              // Otherwise checkIfDone will be called from parsing callback
              if (!parsingComplete) {
                // Wait a bit for parsing to complete
                setTimeout(() => {
                  if (!parsingComplete) {
                    logger.warn('Yahoo IMAP message ended before parse completion');
                    processedCount++;
                    checkIfDone();
                  }
                }, 1000);
              }
            });
          });

          function checkIfDone() {
            if (processedCount >= totalEmails) {
              logger.info('Yahoo IMAP processing complete', {
                total: totalEmails,
                parsed: emails.length,
              });
              imap.end();
              resolve(emails);
            }
          }

          fetch.once('end', () => {
            // Give a bit more time for any pending parsing
            setTimeout(() => {
              if (processedCount < totalEmails) {
                logger.warn('Yahoo IMAP fetch ended before all messages processed', {
                  processedCount,
                  totalEmails,
                });
              }
              logger.info('Yahoo IMAP fetch final count', { parsed: emails.length });
              imap.end();
              resolve(emails);
            }, 2000);
          });

          fetch.once('error', (err) => {
            imap.end();
            reject(err);
          });
        });
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

/**
 * Mark email as read
 */
export async function markEmailAsRead(
  config: YahooConfig,
  uid: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.email,
      password: config.password,
      host: 'imap.mail.yahoo.com',
      port: 993,
      tls: true,
    });

    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err) => {
        if (err) {
          imap.end();
          return reject(err);
        }

        imap.addFlags(uid, '\\Seen', (err) => {
          imap.end();
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

/**
 * Send email via Yahoo SMTP
 */
export async function sendYahooEmail(
  config: YahooConfig,
  to: string,
  subject: string,
  text: string,
  html?: string
): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: 'smtp.mail.yahoo.com',
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: config.email,
      pass: config.password,
    },
  });

  const mailOptions = {
    from: config.email,
    to,
    subject,
    text,
    html: html || text,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info('Yahoo SMTP send completed');
  } catch (error) {
    logger.error('Yahoo SMTP send failed', error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Test Yahoo Mail connection
 * Returns true if connection successful, throws error if connection fails
 */
export async function testYahooConnection(config: YahooConfig): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.email,
      password: config.password,
      host: 'imap.mail.yahoo.com',
      port: 993,
      tls: true,
    });

    const timeout = setTimeout(() => {
      imap.end();
      reject(new Error('Connection timeout - please check your internet connection'));
    }, 15000); // 15 second timeout

    imap.once('ready', () => {
      clearTimeout(timeout);
      // Just verify we can list mailboxes to confirm full authentication
      imap.getBoxes((err, boxes) => {
        imap.end();
        if (err) {
          // Even if listing boxes fails, if we got to 'ready', credentials are correct
          // Some accounts might have restrictions, but connection is valid
          resolve(true);
        } else {
          resolve(true);
        }
      });
    });

    imap.once('error', (err: Error) => {
      clearTimeout(timeout);
      imap.end();
      
      // Provide more specific error messages
      const errorMsg = err.message.toLowerCase();
      if (errorMsg.includes('invalid credentials') || 
          errorMsg.includes('authentication failed') ||
          errorMsg.includes('login failed') ||
          errorMsg.includes('incorrect') ||
          errorMsg.includes('invalid password')) {
        reject(new Error('Invalid email or password. Please check your credentials and ensure you are using an App Password (not your regular password).'));
      } else if (errorMsg.includes('econnrefused') || errorMsg.includes('enotfound') || errorMsg.includes('timeout')) {
        reject(new Error('Cannot connect to Yahoo Mail servers. Please check your internet connection.'));
      } else if (errorMsg.includes('econnreset') || errorMsg.includes('socket')) {
        reject(new Error('Connection was reset. Please try again.'));
      } else {
        reject(new Error(`Connection failed: ${err.message}. Please verify your credentials are correct.`));
      }
    });

    imap.connect();
  });
}

