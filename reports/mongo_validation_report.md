# MongoDB Validation Report

Generated: 2026-02-07T20:55:36.198Z

## Counts

| Collection | JSON Count | Mongo Count | Match |
| --- | ---: | ---: | :---: |
| users | 1 | 1 | ✅ |
| clients | 89 | 49 | ⚠️ |
| conversations | 158 | 120 | ⚠️ |
| messages | 297 | 239 | ⚠️ |
| tags | 4 | 4 | ✅ |
| conversation_tags | 86 | 86 | ✅ |
| services | 5 | 5 | ✅ |
| appointments | 81 | 81 | ✅ |
| tasks | 1 | 1 | ✅ |
| client_notes | 19 | 1 | ⚠️ |
| client_files | 38 | 2 | ⚠️ |
| reminders | 0 | 0 | ✅ |
| email_integrations | 1 | 1 | ✅ |
| google_calendar_sync | 0 | 0 | ✅ |
| contact_files | 2 | 2 | ✅ |
| contact_custom_fields | 0 | 0 | ✅ |
| contact_notes | 1 | 1 | ✅ |

## Spot Checks

- users: 1 ok, 0 mismatch (sampled 1)
- clients: 0 ok, 3 mismatch (sampled 3)
- conversations: 0 ok, 3 mismatch (sampled 3)
- messages: 0 ok, 3 mismatch (sampled 3)
- tags: 3 ok, 0 mismatch (sampled 3)
- conversation_tags: 3 ok, 0 mismatch (sampled 3)
- services: 3 ok, 0 mismatch (sampled 3)
- appointments: 3 ok, 0 mismatch (sampled 3)
- tasks: 1 ok, 0 mismatch (sampled 1)
- client_notes: 3 ok, 0 mismatch (sampled 3)
- client_files: 3 ok, 0 mismatch (sampled 3)
- reminders: no samples (empty)
- email_integrations: 0 ok, 1 mismatch (sampled 1)
- google_calendar_sync: no samples (empty)
- contact_files: 2 ok, 0 mismatch (sampled 2)
- contact_custom_fields: no samples (empty)
- contact_notes: 1 ok, 0 mismatch (sampled 1)
