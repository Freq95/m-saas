# Split Analysis: Notifications Page

## Page

- `src/app/(main)/notifications/page.tsx`
- Approx metrics: `290` lines, `4` `useState`, `2` `useEffect`, `4` `fetch`.

## Current Responsibilities

- Auth gate check and redirect behavior.
- Notification list fetch with pagination.
- Mark-as-read and mark-all-read mutations.
- Icon/url derivation and list rendering.

## Why Splitting Makes Sense

- This is a medium-complexity page with both orchestration and rendering.
- Similar list + pagination + mutation pattern appears across app pages.
- Auth-check logic is repeated in other client pages.

## Suggested Responsibility Boundaries

## Data

- Notifications list/read/read-all operations.
- Shared response normalization for unread counts and cursor metadata.

## Hooks

- Notifications list/pagination hook.
- Read-state mutation hook (single + bulk).
- Auth guard hook (if standardized across client pages).

## Components

- Header and unread badge section.
- Notification row list.
- Empty state and load-more section.

## Expected Benefits

- Lower noise in page render function.
- Better consistency for list mutation behavior.
- Easier to add filters/types later.

## Main Risks

- Local unread count and row state can desync after mutation.
- Redirect timing behavior can change if auth guard is moved.

## Guardrails

- Keep unread count update logic close to mutation logic.
- Preserve current redirect semantics.

## Priority

- `P1`.

