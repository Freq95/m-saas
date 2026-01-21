/**
 * Email HTML content component using iframe for complete style isolation
 * This matches how Yahoo Mail and other major email clients render emails
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import styles from '../page.module.css';
import { DOMPURIFY_CONFIG, INBOX_CONFIG } from '../constants';
import { extractBodyContent, isValidHtmlContent } from '../utils';

interface EmailHtmlContentProps {
  html: string;
}

export function EmailHtmlContent({ html }: EmailHtmlContentProps) {
  const [iframeHeight, setIframeHeight] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Validate HTML is not empty
  if (!html || !html.trim()) {
    return (
      <div className={styles.emailContainer} style={{ padding: '1rem', color: '#737373' }}>
        Email content is empty
      </div>
    );
  }

  // Check if HTML is valid after sanitization
  if (!isValidHtmlContent(html)) {
    return (
      <div className={styles.emailContainer} style={{ padding: '1rem', color: '#737373' }}>
        Email content could not be displayed
      </div>
    );
  }

  // Sanitize HTML with permissive config for emails
  const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG);
  const bodyContent = extractBodyContent(sanitized);

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

    let timeoutId: NodeJS.Timeout;
    let retryCount = 0;

    const calculateHeight = (doc: Document) => {
      try {
        const height = Math.max(
          doc.body.scrollHeight,
          doc.body.offsetHeight,
          doc.documentElement?.clientHeight || 0,
          doc.documentElement?.scrollHeight || 0
        );
        // Add some padding and ensure minimum height
        setIframeHeight(Math.max(height + 20, INBOX_CONFIG.IFRAME_MIN_HEIGHT));
      } catch (e) {
        setIframeHeight(INBOX_CONFIG.IFRAME_DEFAULT_HEIGHT);
      }
    };

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc && doc.body) {
          // Wait for images to load before calculating height
          const images = doc.querySelectorAll('img');
          let imagesLoaded = 0;
          const totalImages = images.length;
          
          if (totalImages === 0) {
            // No images, calculate height immediately
            calculateHeight(doc);
          } else {
            // Wait for all images to load
            images.forEach((img) => {
              if (img.complete) {
                imagesLoaded++;
              } else {
                img.addEventListener('load', () => {
                  imagesLoaded++;
                  if (imagesLoaded === totalImages) {
                    calculateHeight(doc);
                  }
                });
                img.addEventListener('error', () => {
                  imagesLoaded++;
                  if (imagesLoaded === totalImages) {
                    calculateHeight(doc);
                  }
                });
              }
            });
            
            // Fallback: calculate after all images are loaded or timeout
            if (imagesLoaded === totalImages) {
              calculateHeight(doc);
            } else {
              timeoutId = setTimeout(() => {
                calculateHeight(doc);
              }, INBOX_CONFIG.IFRAME_IMAGE_LOAD_TIMEOUT);
            }
          }
        } else if (retryCount < INBOX_CONFIG.IFRAME_MAX_RETRIES) {
          // Retry if document not ready
          retryCount++;
          timeoutId = setTimeout(handleLoad, INBOX_CONFIG.IFRAME_RETRY_DELAY);
        } else {
          // Fallback to default height after max retries
          setIframeHeight(INBOX_CONFIG.IFRAME_DEFAULT_HEIGHT);
        }
      } catch (e) {
        // Cross-origin or other error, use default height
        console.warn('Could not access iframe content for auto-resize:', e);
        setIframeHeight(INBOX_CONFIG.IFRAME_DEFAULT_HEIGHT);
      }
    };

    iframe.addEventListener('load', handleLoad);
    // Also try after a short delay in case content loads asynchronously
    timeoutId = setTimeout(handleLoad, 100);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
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
          height: iframeHeight ? `${iframeHeight}px` : `${INBOX_CONFIG.IFRAME_DEFAULT_HEIGHT}px`,
          minHeight: `${INBOX_CONFIG.IFRAME_MIN_HEIGHT}px`,
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

