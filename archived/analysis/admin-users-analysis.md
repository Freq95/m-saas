# Split Analysis: Admin Users Page

## Page

- `src/app/(admin)/admin/users/page.tsx`
- Approx metrics: `214` lines, `2` `useState`, `1` `useEffect`, `2` `fetch`.

## Current Responsibilities

- Search/filter controls and fetch orchestration.
- Ban/unban action flow and loading state.
- User list rendering and status display.

## Why Splitting Makes Sense

- Similar reasoning to admin posts page: medium complexity, high pattern overlap.
- Shared admin control patterns can reduce future maintenance cost.

## Suggested Responsibility Boundaries

## Data

- Admin users query.
- Ban/unban action operations.

## Hooks

- Users list orchestration (filter/search/load).
- User action mutation hook.

## Components

- Shared admin toolbar (filters/search).
- Shared row action patterns and status badges where possible.

## Expected Benefits

- Better consistency in admin UX and behavior wiring.
- Easier to add more user-moderation actions over time.

## Main Risks

- Extracting too much without reuse can add indirection.

## Guardrails

- Prioritize shared admin abstractions only when reused across pages.

## Priority

- `P2` (or `P1` if admin surface area grows quickly).

