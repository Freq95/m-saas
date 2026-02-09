# Page Splitting Deep Dive (data/hooks/components)

## Scope

This analysis evaluates where splitting `page.tsx` into `data`, `hooks`, and `components` is likely to improve maintainability in the current project.

Only pages with clear mixed responsibilities were selected for deep-dive recommendations.

## Evaluation Criteria

- Structural complexity: line count and number of state/effect/fetch responsibilities.
- Responsibility mixing: API orchestration, state coordination, and rendering in a single page.
- Reuse potential: duplicated patterns across pages (pagination, auth checks, admin actions).
- Change risk: likelihood of regressions when making common feature updates.
- Team ergonomics: merge conflict probability and onboarding clarity.

## Project Snapshot

- Total `page.tsx` files: `19`
- Large pages (`>= 300` lines): `5`
- Very large pages (`>= 500` lines): `3` (`post/[id]`, `settings`, `admin/reports`)
- High mixed-responsibility pages (client + substantial state + multiple fetches): `6+`

The codebase already has one strong split pattern in `src/app/(main)/feed/page.tsx` + `src/components/feed/feed-client.tsx`, so this direction aligns with existing architecture.

## Recommended Pages

## P0 (split first)

- `src/app/(main)/post/[id]/page.tsx`
- `src/app/(main)/settings/page.tsx`
- `src/app/(admin)/admin/reports/page.tsx`
- `src/app/(main)/messages/[id]/page.tsx`

## P1 (split next)

- `src/app/(main)/profile/[id]/page.tsx`
- `src/app/(main)/notifications/page.tsx`

## P2 (split if admin area keeps growing)

- `src/app/(admin)/admin/posts/page.tsx`
- `src/app/(admin)/admin/users/page.tsx`

## Pages That Do Not Need Splitting Now

- `src/app/(main)/messages/page.tsx`
- `src/app/(main)/post/new/page.tsx`
- `src/app/(main)/messages/new/page.tsx`
- Most auth shell pages unless new async workflows are added.

## Cross-Page Extraction Opportunities

## Data layer opportunities

- A typed API module for common client calls (`auth/me`, paginated list endpoints, admin PATCH actions).
- Shared response parsing and error normalization.
- Shared pagination request builder (`limit`, `cursor`, filters).

## Hook layer opportunities

- Reusable hooks for paginated resources.
- Reusable hooks for "load + mutate + optimistic local update" workflows.
- Specialized hooks for polling + visibility-aware refresh (messages).

## Component layer opportunities

- Admin list controls (filter + search + row actions) shared between users/posts/reports.
- Page-level skeleton and empty/error states by domain.
- Repeated modal/action sections (confirm, report, hide/ban) extracted from heavy pages.

## Expected Benefits

- Smaller page files with clearer ownership boundaries.
- Lower risk when editing behavior logic vs visual layout.
- Better testability of data and orchestration logic.
- Fewer merge conflicts on high-traffic pages.

## Main Risks and Guardrails

- Risk: over-fragmentation into tiny files with low value.
- Guardrail: split only where there is clear responsibility separation and sustained complexity.

- Risk: inconsistent folder conventions.
- Guardrail: define one page-level pattern and apply it consistently.

- Risk: accidental behavior changes during extraction.
- Guardrail: move in thin slices and preserve existing endpoint contracts and state transitions.

## Suggested Rollout Strategy

1. Start with one P0 page to establish a repeatable pattern.
2. Apply same shape to remaining P0 pages.
3. Reassess P1/P2 after first wave to avoid unnecessary fragmentation.
4. Keep simple pages intact.

## Related Deep-Dive Docs

- `reports/page-splitting-post-detail-analysis.md`
- `reports/page-splitting-settings-analysis.md`
- `reports/page-splitting-admin-reports-analysis.md`
- `reports/page-splitting-messages-conversation-analysis.md`
- `reports/page-splitting-profile-analysis.md`
- `reports/page-splitting-notifications-analysis.md`
- `reports/page-splitting-admin-posts-analysis.md`
- `reports/page-splitting-admin-users-analysis.md`

