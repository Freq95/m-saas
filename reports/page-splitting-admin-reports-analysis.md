# Split Analysis: Admin Reports Page

## Page

- `src/app/(admin)/admin/reports/page.tsx`
- Approx metrics: `509` lines, `3` `useState`, `1` `useEffect`, `8` `fetch`.

## Current Responsibilities

- Report list loading with status filter and pagination.
- Report detail expansion and detail fetch.
- Multi-branch admin actions (hide content, ban user, dismiss, resolve).
- Action sequencing across multiple endpoints.
- Rendering list/detail/action UI.

## Why Splitting Makes Sense

- This page has complex orchestration logic relative to UI complexity.
- Action workflows contain branching business logic that should be isolated.
- Similar admin action patterns exist elsewhere (posts/users), so reuse is possible.

## Suggested Responsibility Boundaries

## Data

- Report list/detail queries.
- Admin action request operations.

## Hooks

- Reports list + pagination hook.
- Report detail expansion hook.
- Admin action orchestrator hook for branching workflows.

## Components

- Filter bar.
- Report row and expandable details panel.
- Action button group.

## Expected Benefits

- Business-critical admin actions become easier to reason about.
- Lower risk of regressions when adding new moderation actions.
- Stronger consistency with other admin pages.

## Main Risks

- Action-order semantics can be broken during extraction.
- Detail context (selected report) can desync with action handlers.

## Guardrails

- Treat action sequencing as an explicit orchestration unit.
- Keep optimistic refresh/reset behavior centralized.

## Priority

- `P0`.

