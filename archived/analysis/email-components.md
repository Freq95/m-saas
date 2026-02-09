# Email Display Components Analysis

## Components that display emails:

### 1. **EmailHtmlContent** (app/inbox/page.tsx)
- **Location**: `app/inbox/page.tsx` (lines 12-147)
- **Purpose**: Renders HTML emails in an iframe for style isolation
- **Features**:
  - Uses iframe with `srcdoc` for complete CSS isolation
  - DOMPurify sanitization with permissive config for emails
  - Auto-resize iframe based on content height
  - Forces light mode for email content
- **Used when**: `msg.html` exists

### 2. **Fallback Text Display** (app/inbox/page.tsx)
- **Location**: `app/inbox/page.tsx` (line 346)
- **Purpose**: Displays plain text when HTML is not available
- **Code**: `<div className={styles.messageText}>{msg.content || msg.text}</div>`
- **Used when**: `msg.html` is missing

### 3. **Message Container** (app/inbox/page.tsx)
- **Location**: `app/inbox/page.tsx` (lines 342-356)
- **Purpose**: Wraps email content and attachments
- **Features**:
  - Conditionally renders HTML or text
  - Displays attachments list
  - Shows message timestamp

## API Endpoints that process emails:

### 1. **/api/yahoo/sync** (app/api/yahoo/sync/route.ts)
- **Purpose**: Syncs emails from Yahoo Mail
- **Processes**: Parses emails, extracts HTML, processes CID images, saves to storage

### 2. **/api/conversations** (app/api/conversations/route.ts)
- **Purpose**: Returns list of all conversations
- **Processes**: Enriches conversations with message counts and tags

### 3. **/api/conversations/[id]** (app/api/conversations/[id]/route.ts)
- **Purpose**: Returns conversation details and messages
- **Processes**: Parses stored message format (JSON) and extracts HTML/text

### 4. **/api/conversations/[id]/messages** (app/api/conversations/[id]/messages/route.ts)
- **Purpose**: Sends new messages in a conversation

## Helper Libraries:

### 1. **lib/email-types.ts**
- **Functions**: `parseStoredMessage()`, `serializeMessage()`
- **Purpose**: Standardized email message structure

### 2. **lib/yahoo-mail.ts**
- **Functions**: `fetchYahooEmails()`, `cleanText()`, `extractImagesFromHtml()`, `extractAttachments()`
- **Purpose**: Yahoo Mail integration and email parsing

## Summary:

**Total components to display emails: 2**
1. `EmailHtmlContent` - for HTML emails (iframe)
2. Fallback text div - for plain text emails

**Total API endpoints: 4**
1. `/api/yahoo/sync` - sync emails
2. `/api/conversations` - list conversations
3. `/api/conversations/[id]` - get messages
4. `/api/conversations/[id]/messages` - send messages

