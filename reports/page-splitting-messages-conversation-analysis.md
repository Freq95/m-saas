# Split Analysis: Messages Conversation Page

## Page

- `src/app/(main)/messages/[id]/page.tsx`
- Approx metrics: `428` lines, `6` `useState`, `3` `useEffect`, `3` `fetch`.

## Current Responsibilities

- Initial message load and paginated history fetch.
- Polling for new messages with visibility-aware interval changes.
- Auto-scroll and scroll-position behavior management.
- Message sending flow and input constraints.
- Rendering conversation and side list layout.

## Why Splitting Makes Sense

- Real-time/polling behavior and scroll logic are complex and stateful.
- UI and transport orchestration are interleaved.
- This page is a likely source of subtle UX bugs if changed in-place.

## Suggested Responsibility Boundaries

## Data

- Conversation fetch/send operations.
- Polling fetch call for latest messages.

## Hooks

- Conversation state hook (initial + pagination + send).
- Polling/visibility hook.
- Scroll management hook (auto-scroll/new-message indicator).

## Components

- Conversation header.
- Message list container.
- Composer/input section.

## Expected Benefits

- Better reliability in polling and scroll behavior.
- Easier performance tuning without touching rendering code.
- Reduced accidental breakage in send/load flows.

## Main Risks

- Scroll and polling coordination can break if split poorly.
- Stale closures can reappear if state ownership is scattered.

## Guardrails

- Keep polling + merge strategy in one orchestrator hook.
- Keep scroll preference logic near message list state transitions.

## Priority

- `P0`.

