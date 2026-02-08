# Inbox: Link Conversation + Save Attachments

## Scope
- Add UI flow to link an email conversation to a client.
- Ensure attachments are visible in Inbox for all email message variants.
- Allow saving a received email attachment to a client profile (existing or new).

## Point 1: Link Conversation To Client
- Inbox conversation header gets a "linked client" action.
- User can:
  - pick an existing client, or
  - create a new client quickly.
- System updates `conversations.client_id` via `PATCH /api/conversations/[id]`.

## Point 2: Attachment Visibility
- Show message attachments for both:
  - plain-text email display, and
  - HTML email display.
- Keep attachment metadata visible (name, type, size).

## Point 3: Save Attachment To Client
- Persist Yahoo attachment files on disk during sync.
- Store attachment records (`message_attachments`) with relation to message/conversation.
- Add API endpoint to save one attachment to client files:
  - existing client (`clientId`), or
  - new client (auto-created from conversation contact data).
- Copy file into `uploads/clients` and insert in `client_files`.

## Notes
- Existing client file APIs remain the source of truth for client documents.
- Webhook email attachment ingestion can be added in a follow-up.

