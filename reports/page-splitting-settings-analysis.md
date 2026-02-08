# Split Analysis: Settings Page

## Page

- `src/app/(main)/settings/page.tsx`
- Approx metrics: `549` lines, `5` `useState`, `2` `useEffect`, `5` `fetch`.

## Current Responsibilities

- Initial settings load and hydration.
- Username availability debounce/check flow.
- Avatar upload and removal.
- Save/update pipeline with validation.
- Change tracking and rendering of full settings UI.

## Why Splitting Makes Sense

- Data mutation workflows are mixed with form rendering.
- Debounced username validation is behavior-heavy and isolated.
- Avatar operations are independent and reusable behavior.
- This page will likely evolve frequently as profile settings grow.

## Suggested Responsibility Boundaries

## Data

- Settings read/update calls.
- Username availability call.
- Avatar upload/delete calls.

## Hooks

- Settings form state and dirty-state orchestration.
- Username validation hook with debounce/timing control.
- Avatar action hook (upload/remove/refresh behavior).

## Components

- Profile section.
- Notification preferences section.
- Save footer/action section.

## Expected Benefits

- Cleaner separation between form UI and async behavior.
- Easier to debug username and avatar flows independently.
- Better path to adding settings sections without page bloat.

## Main Risks

- Accidental mismatch between initial data and dirty-state comparison.
- Validation behavior drift if debounce logic moves incorrectly.

## Guardrails

- Keep one source of truth for form shape and normalization.
- Keep username-check semantics unchanged (including timing behavior).

## Priority

- `P0`.

