# Split Analysis: Admin Posts Page

## Page

- `src/app/(admin)/admin/posts/page.tsx`
- Approx metrics: `233` lines, `2` `useState`, `1` `useEffect`, `2` `fetch`.

## Current Responsibilities

- Search/filter controls and fetch trigger behavior.
- Admin post visibility action flow.
- List rendering and status visualization.

## Why Splitting Makes Sense

- Not heavy alone, but strongly overlaps with admin users/reports patterns.
- Splitting here has architectural value if admin section keeps expanding.
- Shared admin list patterns can reduce future duplication.

## Suggested Responsibility Boundaries

## Data

- Admin posts query.
- Hide/unhide action call.

## Hooks

- Admin posts list state (filter/search/loading).
- Admin post action handler state.

## Components

- Reusable admin filter/search bar.
- Reusable admin list row action controls.

## Expected Benefits

- Consistency with other admin pages.
- Reduced duplicate fetch/action logic across admin area.

## Main Risks

- Over-abstracting too early for a moderate-size page.

## Guardrails

- Only extract pieces that are used by both posts and users (or reports).

## Priority

- `P2` (or `P1` if admin roadmap is active).

