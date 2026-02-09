# Split Analysis: Profile Page

## Page

- `src/app/(main)/profile/[id]/page.tsx`
- Approx metrics: `370` lines, `4` `useState`, `3` `useEffect`, `3` `fetch`.

## Current Responsibilities

- User lookup by id/username and profile fetch.
- Current-user fetch and ownership checks.
- Profile posts pagination and load-more flow.
- Header/profile/posts rendering and empty/error handling.

## Why Splitting Makes Sense

- Data dependencies are sequential (profile first, then posts by resolved id).
- Page mixes identity resolution, pagination behavior, and layout rendering.
- Similar posts listing patterns exist in other pages.

## Suggested Responsibility Boundaries

## Data

- Profile query by route parameter.
- Profile posts paginated query.

## Hooks

- Profile identity resolution + fetch hook.
- Profile posts pagination hook.
- Ownership/permissions derivation hook.

## Components

- Profile header and metadata card.
- Posts list section with load-more controls.
- Standardized error/empty states.

## Expected Benefits

- Cleaner sequencing logic for profile then posts.
- Reusable pagination behavior for user-content lists.
- Easier extension (tabs, additional profile sections).

## Main Risks

- Route param/id resolution logic can be duplicated incorrectly.
- Ownership checks can drift from source-of-truth auth state.

## Guardrails

- Keep id/username resolution in one place.
- Keep ownership derivation pure and deterministic.

## Priority

- `P1`.

