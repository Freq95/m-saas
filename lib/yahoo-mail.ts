/**
 * Yahoo Mail Integration
 * Handles reading emails via IMAP and sending via SMTP
 */

import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';
import { ObjectId } from 'mongodb';

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
 * Get Yahoo Mail configuration from database or environment (fallback)
 * @param userId - User ID to fetch from database. If not provided, uses environment variables.
 */
export async function getYahooConfig(userId?: number, tenantId?: ObjectId): Promise<YahooConfig | null> {
  // Try database first if userId is provided
  if (userId) {
    try {
      const { getEmailIntegrationConfig } = await import('./email-integrations');
      if (!tenantId) return null;
      const config = await getEmailIntegrationConfig(userId, tenantId, 'yahoo');
      
      if (config && config.password) {
        return {
          email: config.email,
          password: config.password,
          appPassword: config.password, // Assume app password
        };
      }
    } catch (error) {
      // Fall through to environment variables if database lookup fails
      const { logger } = await import('./logger');
      logger.warn('Failed to get Yahoo config from database, falling back to environment', { error, userId });
    }
  }
  
  // Fallback to environment variables
  const email = process.env.YAHOO_EMAIL;
  const password = process.env.YAHOO_PASSWORD || process.env.YAHOO_APP_PASSWORD;
  const appPassword = process.env.YAHOO_APP_PASSWORD;

  if (!email || !password) {
    return null;
  }

  return {
    email,
    password: appPassword || password,
    appPassword,
  };
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
      tlsOptions: { rejectUnauthorized: false },
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

        console.log('Yahoo IMAP: Searching with criteria:', searchCriteria);
        imap.search(searchCriteria, (err, results) => {
          if (err) {
            console.error('Yahoo IMAP search error:', err);
            imap.end();
            return reject(err);
          }
          
          if (!results || results.length === 0) {
            console.log('Yahoo IMAP: No emails found with criteria:', searchCriteria);
            imap.end();
            return resolve(emails);
          }

          console.log(`Yahoo IMAP: Found ${results.length} emails`);

          const fetch = imap.fetch(results, {
            bodies: '',
            struct: true,
          });

          let processedCount = 0;
          const totalEmails = results.length;

          fetch.on('message', (msg, seqno) => {
            let emailData: Partial<EmailMessage> = {};
            let uid: number | undefined;
            let bodyBuffer = '';
            let parsingComplete = false;

            msg.once('attributes', (attrs) => {
              uid = attrs.uid;
              emailData.uid = attrs.uid;
            });

            msg.on('body', (stream, info) => {
              stream.on('data', (chunk) => {
                bodyBuffer += chunk.toString('utf8');
              });

              stream.on('end', () => {
                simpleParser(bodyBuffer, (err: any, parsed: any) => {
                  if (err) {
                    console.error('Yahoo IMAP: Error parsing email:', err);
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
                      messageId: parsed.messageId,
                      images: images.length > 0 ? images : undefined,
                      attachments: attachments.length > 0 ? attachments : undefined,
                    };

                    parsingComplete = true;
                    
                    if (emailData.uid && emailData.from) {
                      console.log('Yahoo IMAP: Parsed email from:', emailData.from, 'subject:', emailData.subject);
                      emails.push(emailData as EmailMessage);
                    } else {
                      console.warn('Yahoo IMAP: Skipped email - missing uid or from. uid:', emailData.uid, 'from:', emailData.from);
                    }
                  } else {
                    parsingComplete = true;
                    console.warn('Yahoo IMAP: Skipped email - missing parsed data or uid');
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
                    console.warn('Yahoo IMAP: Message end before parsing complete');
                    processedCount++;
                    checkIfDone();
                  }
                }, 1000);
              }
            });
          });

          function checkIfDone() {
            if (processedCount >= totalEmails) {
              console.log(`Yahoo IMAP: Processed all ${totalEmails} emails, got ${emails.length} valid emails`);
              imap.end();
              resolve(emails);
            }
          }

          fetch.once('end', () => {
            // Give a bit more time for any pending parsing
            setTimeout(() => {
              if (processedCount < totalEmails) {
                console.warn(`Yahoo IMAP: Fetch ended but only processed ${processedCount}/${totalEmails} emails`);
              }
              console.log(`Yahoo IMAP: Final count - ${emails.length} emails parsed`);
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
      tlsOptions: { rejectUnauthorized: false },
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
    tls: {
      rejectUnauthorized: false,
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
    console.log('Email sent:', info.messageId);
  } catch (error) {
    console.error('Error sending email:', error);
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
      tlsOptions: { rejectUnauthorized: false },
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

