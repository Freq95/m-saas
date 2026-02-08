# Split Analysis: Post Detail Page

## Page

- `src/app/(main)/post/[id]/page.tsx`
- Approx metrics: `987` lines, `14` `useState`, `4` `useEffect`, `9` `fetch`.

## Current Responsibilities

- Post fetch and error/loading lifecycle.
- Comment list fetch, add, delete, and reply handling.
- Report flow and reason capture.
- Post edit/delete/sold-toggle actions.
- Multiple modal and transient UI states.
- Full rendering of header/body/comments/actions.

## Why Splitting Makes Sense

- This file is the strongest "god page" in the project.
- Many independent async workflows are coupled in one component.
- Local state is broad and cross-cutting, increasing regression risk.
- Most bug fixes here will require touching unrelated logic blocks.

## Suggested Responsibility Boundaries

## Data

- Post detail API operations.
- Comment operations (list/add/delete/replies).
- Post moderation/report/sold action calls.

## Hooks

- Post lifecycle orchestration hook.
- Comment thread interaction hook.
- Action-state hook for report/edit/delete/sold toggles.

## Components

- Post content/action panel.
- Comment thread block.
- Modal/action sections (report, delete confirm, edit entry point).

## Expected Benefits

- Large drop in cognitive load when changing one behavior.
- Better testability of comment/report/action flows.
- Safer parallel work across team members.

## Main Risks

- High extraction surface can cause subtle behavior drift.
- Modal and action state can become fragmented if boundaries are unclear.

## Guardrails

- Preserve existing endpoint contracts exactly.
- Keep optimistic/local count updates in one orchestrator layer.
- Move one workflow at a time (post load, then comments, then actions).

## Priority

- `P0` (highest impact candidate in the repository).

